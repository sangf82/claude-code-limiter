'use strict';

const express = require('express');
const router = express.Router();
const db = require('../db');
const { hookAuth } = require('../services/auth');
const { evaluateLimits } = require('../services/limiter');
const { recordEvent, getUsageSummary, getCreditBalance } = require('../services/usage');
const { broadcast } = require('../ws');

/**
 * Extract client IP from request.
 */
function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.ip || req.connection.remoteAddress || null;
}

/**
 * POST /api/v1/sync
 * SessionStart: sync config, report model/machine, update last_seen.
 * Body: { auth_token, model, hostname?, platform?, arch?, os_version?, node_version?, claude_version?, session_id? }
 */
router.post('/sync', hookAuth, (req, res) => {
  try {
    const user = req.user;
    const team = req.team;
    const creditWeights = JSON.parse(team.credit_weights);
    const now = new Date().toISOString();
    const clientIp = getClientIp(req);

    // Update last_seen
    db.updateUser(user.id, { last_seen: now });

    // Upsert device info
    let device = null;
    if (req.body.hostname) {
      device = db.upsertDevice(user.id, {
        hostname: req.body.hostname,
        platform: req.body.platform,
        arch: req.body.arch,
        os_version: req.body.os_version,
        node_version: req.body.node_version,
        claude_version: req.body.claude_version,
        ip: clientIp,
      });
    }

    // Record session_start event
    db.recordSessionEvent({
      user_id: user.id,
      device_id: device ? device.id : null,
      type: 'session_start',
      model: req.body.model || null,
      session_id: req.body.session_id || null,
      timestamp: now,
    });

    // Get limits and usage
    const limits = db.getLimitRules(user.id);
    const result = evaluateLimits(user, req.body.model || 'default', creditWeights);

    // Build usage counts for the primary window (daily by default)
    const usageSummary = getUsageSummary(user.id);
    const usage = usageSummary.daily ? usageSummary.daily.counts : {};

    // Find credit budget if any
    const creditRule = limits.find(r => r.type === 'credits');
    let creditBalance = null;
    let creditBudget = null;
    if (creditRule) {
      const cb = getCreditBalance(user.id, creditWeights, creditRule.window, creditRule.value);
      creditBalance = cb.balance;
      creditBudget = cb.budget;
    }

    broadcast({
      type: 'user_status',
      userId: user.id,
      userName: user.name,
      status: user.status,
      model: req.body.model,
      hostname: req.body.hostname,
      timestamp: now,
    });

    res.json({
      status: user.status,
      limits: limits.map(sanitizeRule),
      credit_weights: creditWeights,
      usage,
      credit_balance: creditBalance,
      credit_budget: creditBudget,
      message: null,
    });
  } catch (err) {
    console.error('POST /sync error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/v1/check
 * UserPromptSubmit: check if prompt is allowed, sync local usage.
 * Body: { auth_token, model, local_usage?, prompt_length?, project_dir?, session_id? }
 */
router.post('/check', hookAuth, (req, res) => {
  try {
    const user = req.user;
    const team = req.team;
    const model = req.body.model || 'default';
    const creditWeights = JSON.parse(team.credit_weights);
    const now = new Date().toISOString();
    const clientIp = getClientIp(req);

    // Update last_seen
    db.updateUser(user.id, { last_seen: now });

    // Update device last_seen and IP if we can identify it
    const devices = db.getDevices(user.id);
    if (devices.length > 0) {
      const device = devices[0]; // most recently seen device
      db.upsertDevice(user.id, { hostname: device.hostname, ip: clientIp });
    }

    // Record prompt event
    db.recordSessionEvent({
      user_id: user.id,
      device_id: (devices.length > 0) ? devices[0].id : null,
      type: 'prompt',
      model,
      prompt_length: req.body.prompt_length || null,
      project_dir: req.body.project_dir || null,
      session_id: req.body.session_id || null,
      timestamp: now,
    });

    // Evaluate limits
    const result = evaluateLimits(user, model, creditWeights);

    // If blocked, also record a blocked event
    if (!result.allowed) {
      db.recordSessionEvent({
        user_id: user.id,
        device_id: (devices.length > 0) ? devices[0].id : null,
        type: 'blocked',
        model,
        session_id: req.body.session_id || null,
        blocked_reason: result.reason || null,
        timestamp: now,
      });
    }

    // Get limits for response
    const limits = db.getLimitRules(user.id);

    // Build usage
    const usageSummary = getUsageSummary(user.id);
    const usage = usageSummary.daily ? usageSummary.daily.counts : {};

    // Credit info
    const creditRule = limits.find(r => r.type === 'credits');
    let creditBalance = result.credit_balance;
    let creditBudget = result.credit_budget;
    if (creditRule && creditBalance == null) {
      const cb = getCreditBalance(user.id, creditWeights, creditRule.window, creditRule.value);
      creditBalance = cb.balance;
      creditBudget = cb.budget;
    }

    // Broadcast event
    if (!result.allowed) {
      broadcast({
        type: 'user_blocked',
        userId: user.id,
        userName: user.name,
        model,
        reason: result.reason,
        projectDir: req.body.project_dir || null,
        timestamp: now,
      });
    } else {
      broadcast({
        type: 'user_check',
        userId: user.id,
        userName: user.name,
        model,
        projectDir: req.body.project_dir || null,
        timestamp: now,
      });
    }

    res.json({
      allowed: result.allowed,
      reason: result.reason || null,
      status: user.status,
      limits: limits.map(sanitizeRule),
      usage,
      credit_balance: creditBalance,
      credit_budget: creditBudget,
      message: null,
    });
  } catch (err) {
    console.error('POST /check error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/v1/count
 * Stop: record a completed turn.
 * Body: { auth_token, model, timestamp?, session_id?, response_length? }
 */
router.post('/count', hookAuth, (req, res) => {
  try {
    const user = req.user;
    const team = req.team;
    const model = req.body.model || 'default';
    const timestamp = req.body.timestamp || new Date().toISOString();
    const creditWeights = JSON.parse(team.credit_weights);
    const clientIp = getClientIp(req);

    // Calculate credit cost
    const creditCost = creditWeights[model] || creditWeights['default'] || 1;

    // Record the usage event (existing behavior)
    recordEvent(user.id, model, creditCost, timestamp, 'hook');

    // Update device last_seen and IP
    const devices = db.getDevices(user.id);
    if (devices.length > 0) {
      db.upsertDevice(user.id, { hostname: devices[0].hostname, ip: clientIp });
    }

    // Record turn_complete session event
    db.recordSessionEvent({
      user_id: user.id,
      device_id: (devices.length > 0) ? devices[0].id : null,
      type: 'turn_complete',
      model,
      session_id: req.body.session_id || null,
      response_length: req.body.response_length || null,
      timestamp,
    });

    // Recalculate credit balance
    const limits = db.getLimitRules(user.id);
    const creditRule = limits.find(r => r.type === 'credits');
    let newBalance = null;
    if (creditRule) {
      const cb = getCreditBalance(user.id, creditWeights, creditRule.window, creditRule.value);
      newBalance = cb.balance;
    }

    // Broadcast
    broadcast({
      type: 'user_counted',
      userId: user.id,
      userName: user.name,
      model,
      creditCost,
      sessionId: req.body.session_id || null,
      timestamp,
    });

    res.json({
      recorded: true,
      new_balance: newBalance,
    });
  } catch (err) {
    console.error('POST /count error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/v1/status
 * CLI status command: full dashboard data.
 */
router.get('/status', hookAuth, (req, res) => {
  try {
    const user = req.user;
    const team = req.team;
    const creditWeights = JSON.parse(team.credit_weights);

    const limits = db.getLimitRules(user.id);
    const usageSummary = getUsageSummary(user.id);

    // Credit info
    const creditRule = limits.find(r => r.type === 'credits');
    let creditBalance = null;
    let creditBudget = null;
    if (creditRule) {
      const cb = getCreditBalance(user.id, creditWeights, creditRule.window, creditRule.value);
      creditBalance = cb.balance;
      creditBudget = cb.budget;
    }

    // Per-model limits with current counts
    const perModelStatus = {};
    const perModelRules = limits.filter(r => r.type === 'per_model');
    for (const rule of perModelRules) {
      const mdl = rule.model || 'all';
      if (!perModelStatus[mdl]) perModelStatus[mdl] = {};
      const windowUsage = usageSummary[rule.window];
      const count = windowUsage ? (windowUsage.counts[mdl] || 0) : 0;
      perModelStatus[mdl][rule.window] = {
        used: count,
        limit: rule.value,
        remaining: rule.value === -1 ? -1 : Math.max(0, rule.value - count),
      };
    }

    res.json({
      user: {
        id: user.id,
        name: user.name,
        slug: user.slug,
        status: user.status,
      },
      credit_weights: creditWeights,
      credit_balance: creditBalance,
      credit_budget: creditBudget,
      limits: limits.map(sanitizeRule),
      per_model: perModelStatus,
      usage: usageSummary,
    });
  } catch (err) {
    console.error('GET /status error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/v1/register
 * Exchange an install code for auth_token + config.
 * Body: { code }
 */
router.post('/register', (req, res) => {
  try {
    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ error: 'Install code required' });
    }

    const installCode = db.useInstallCode(code);
    if (!installCode) {
      return res.status(404).json({ error: 'Invalid or already used install code' });
    }

    const user = db.getUser(installCode.user_id);
    if (!user) {
      return res.status(404).json({ error: 'User not found for this install code' });
    }

    const team = db.getTeam(user.team_id);
    const creditWeights = JSON.parse(team.credit_weights);
    const limits = db.getLimitRules(user.id);

    res.json({
      auth_token: user.auth_token,
      user: {
        id: user.id,
        name: user.name,
        slug: user.slug,
        status: user.status,
      },
      limits: limits.map(sanitizeRule),
      credit_weights: creditWeights,
    });
  } catch (err) {
    console.error('POST /register error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/v1/health
 * Simple health check for Docker/load balancer.
 */
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * Strip internal fields from a limit rule for API responses.
 */
function sanitizeRule(rule) {
  return {
    id: rule.id,
    type: rule.type,
    model: rule.model,
    window: rule.window,
    value: rule.value,
    schedule_start: rule.schedule_start,
    schedule_end: rule.schedule_end,
    schedule_tz: rule.schedule_tz,
  };
}

module.exports = router;
