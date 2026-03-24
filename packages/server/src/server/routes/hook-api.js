'use strict';

const express = require('express');
const router = express.Router();
const db = require('../db');
const { hookAuth } = require('../services/auth');
const { evaluateLimits } = require('../services/limiter');
const { recordEvent, getUsageSummary, getCreditBalance } = require('../services/usage');
const { broadcast } = require('../ws');

/**
 * POST /api/v1/sync
 * SessionStart: sync config, report model/machine, update last_seen.
 * Body: { auth_token, model, hostname?, platform? }
 */
router.post('/sync', hookAuth, (req, res) => {
  try {
    const user = req.user;
    const team = req.team;
    const creditWeights = JSON.parse(team.credit_weights);

    // Update last_seen
    db.updateUser(user.id, { last_seen: new Date().toISOString() });

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
      timestamp: new Date().toISOString(),
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
 * Body: { auth_token, model, local_usage? }
 */
router.post('/check', hookAuth, (req, res) => {
  try {
    const user = req.user;
    const team = req.team;
    const model = req.body.model || 'default';
    const creditWeights = JSON.parse(team.credit_weights);

    // Update last_seen
    db.updateUser(user.id, { last_seen: new Date().toISOString() });

    // Evaluate limits
    const result = evaluateLimits(user, model, creditWeights);

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
        timestamp: new Date().toISOString(),
      });
    } else {
      broadcast({
        type: 'user_check',
        userId: user.id,
        userName: user.name,
        model,
        timestamp: new Date().toISOString(),
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
 * Body: { auth_token, model, timestamp? }
 */
router.post('/count', hookAuth, (req, res) => {
  try {
    const user = req.user;
    const team = req.team;
    const model = req.body.model || 'default';
    const timestamp = req.body.timestamp || new Date().toISOString();
    const creditWeights = JSON.parse(team.credit_weights);

    // Calculate credit cost
    const creditCost = creditWeights[model] || creditWeights['default'] || 1;

    // Record the event
    recordEvent(user.id, model, creditCost, timestamp, 'hook');

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
