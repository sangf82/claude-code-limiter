'use strict';

const express = require('express');
const router = express.Router();
const db = require('../db');
const { verifyPassword, hashPassword, createJWT, adminAuth } = require('../services/auth');
const { getUsageSummary, getCreditBalance } = require('../services/usage');
const { broadcast } = require('../ws');

/**
 * POST /api/admin/login
 * Verify admin password, return JWT.
 * Body: { password }
 */
router.post('/login', (req, res) => {
  try {
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ error: 'Password required' });
    }

    const team = db.getDefaultTeam();
    if (!team) {
      return res.status(500).json({ error: 'No team configured' });
    }

    if (!verifyPassword(password, team.admin_password)) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    const token = createJWT({ teamId: team.id });

    // Set cookie and return token
    res.cookie('jwt', token, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    });

    res.json({
      token,
      team: {
        id: team.id,
        name: team.name,
        credit_weights: JSON.parse(team.credit_weights),
      },
    });
  } catch (err) {
    console.error('POST /login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// All routes below require admin auth
router.use(adminAuth);

/**
 * GET /api/admin/users
 * List all users with live usage.
 */
router.get('/users', (req, res) => {
  try {
    const team = req.team;
    const creditWeights = JSON.parse(team.credit_weights);
    const users = db.getAllUsers(team.id);

    const result = users.map(user => {
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

      return {
        id: user.id,
        slug: user.slug,
        name: user.name,
        status: user.status,
        killed_at: user.killed_at,
        last_seen: user.last_seen,
        created_at: user.created_at,
        limits,
        usage: usageSummary,
        credit_balance: creditBalance,
        credit_budget: creditBudget,
      };
    });

    res.json({ users: result });
  } catch (err) {
    console.error('GET /users error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/admin/users
 * Create a user and generate an install code.
 * Body: { name, slug, limits? }
 */
router.post('/users', (req, res) => {
  try {
    const team = req.team;
    const { name, slug, limits } = req.body;

    if (!name || !slug) {
      return res.status(400).json({ error: 'name and slug are required' });
    }

    // Check slug uniqueness
    const existing = db.getUserBySlug(team.id, slug);
    if (existing) {
      return res.status(409).json({ error: `User with slug "${slug}" already exists` });
    }

    // Create user
    const user = db.createUser({ teamId: team.id, slug, name });

    // Create limit rules if provided
    if (limits && Array.isArray(limits)) {
      for (const rule of limits) {
        db.createLimitRule({
          userId: user.id,
          type: rule.type,
          model: rule.model,
          window: rule.window,
          value: rule.value,
          schedule_start: rule.schedule_start,
          schedule_end: rule.schedule_end,
          schedule_tz: rule.schedule_tz,
        });
      }
    }

    // Generate install code
    const installCode = db.createInstallCode(user.id);

    // Get the full user with limits
    const fullLimits = db.getLimitRules(user.id);

    res.status(201).json({
      user: {
        id: user.id,
        slug: user.slug,
        name: user.name,
        status: user.status,
        auth_token: user.auth_token,
        created_at: user.created_at,
      },
      limits: fullLimits,
      install_code: installCode,
    });
  } catch (err) {
    console.error('POST /users error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/admin/users/:id
 * Update a user (name, slug, status, limits).
 * Body: { name?, slug?, status?, limits? }
 */
router.put('/users/:id', (req, res) => {
  try {
    const userId = req.params.id;
    const user = db.getUser(userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify user belongs to this team
    if (user.team_id !== req.teamId) {
      return res.status(403).json({ error: 'User does not belong to your team' });
    }

    const { name, slug, status, limits } = req.body;
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (slug !== undefined) updates.slug = slug;
    if (status !== undefined) updates.status = status;

    if (Object.keys(updates).length > 0) {
      db.updateUser(userId, updates);
    }

    // Replace limits if provided
    if (limits !== undefined && Array.isArray(limits)) {
      db.deleteLimitRulesForUser(userId);
      for (const rule of limits) {
        db.createLimitRule({
          userId,
          type: rule.type,
          model: rule.model,
          window: rule.window,
          value: rule.value,
          schedule_start: rule.schedule_start,
          schedule_end: rule.schedule_end,
          schedule_tz: rule.schedule_tz,
        });
      }
    }

    const updatedUser = db.getUser(userId);
    const updatedLimits = db.getLimitRules(userId);

    // Broadcast status change
    if (status && status !== user.status) {
      const eventType = status === 'killed' ? 'user_killed' : 'user_status_change';
      broadcast({
        type: eventType,
        userId: updatedUser.id,
        userName: updatedUser.name,
        oldStatus: user.status,
        newStatus: status,
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      user: {
        id: updatedUser.id,
        slug: updatedUser.slug,
        name: updatedUser.name,
        status: updatedUser.status,
        killed_at: updatedUser.killed_at,
        last_seen: updatedUser.last_seen,
        created_at: updatedUser.created_at,
      },
      limits: updatedLimits,
    });
  } catch (err) {
    console.error('PUT /users/:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/admin/users/:id
 * Remove a user and all related data.
 */
router.delete('/users/:id', (req, res) => {
  try {
    const userId = req.params.id;
    const user = db.getUser(userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.team_id !== req.teamId) {
      return res.status(403).json({ error: 'User does not belong to your team' });
    }

    db.deleteUser(userId);

    res.json({ deleted: true, userId });
  } catch (err) {
    console.error('DELETE /users/:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/admin/usage
 * Usage history data for charts.
 * Query: ?user_id=X&window=daily&days=30
 */
router.get('/usage', (req, res) => {
  try {
    const team = req.team;
    const { user_id, window: windowType, days } = req.query;
    const numDays = parseInt(days, 10) || 30;

    if (user_id) {
      // Verify user belongs to team
      const user = db.getUser(user_id);
      if (!user || user.team_id !== team.id) {
        return res.status(404).json({ error: 'User not found' });
      }

      const usageSummary = getUsageSummary(user_id);

      // Get daily breakdown for chart
      const since = new Date(Date.now() - numDays * 24 * 60 * 60 * 1000).toISOString();
      const dailyRows = db.getDb().prepare(
        `SELECT DATE(timestamp) AS day, model, COUNT(*) AS count, SUM(credit_cost) AS credits
         FROM usage_event
         WHERE user_id = ? AND timestamp >= ?
         GROUP BY DATE(timestamp), model
         ORDER BY day ASC`
      ).all(user_id, since);

      res.json({ user_id, summary: usageSummary, daily: dailyRows });
    } else {
      // All users
      const users = db.getAllUsers(team.id);
      const since = new Date(Date.now() - numDays * 24 * 60 * 60 * 1000).toISOString();

      const dailyRows = db.getDb().prepare(
        `SELECT DATE(e.timestamp) AS day, e.user_id, u.name AS user_name, e.model, COUNT(*) AS count, SUM(e.credit_cost) AS credits
         FROM usage_event e
         JOIN user u ON e.user_id = u.id
         WHERE u.team_id = ? AND e.timestamp >= ?
         GROUP BY DATE(e.timestamp), e.user_id, e.model
         ORDER BY day ASC`
      ).all(team.id, since);

      res.json({ daily: dailyRows });
    }
  } catch (err) {
    console.error('GET /usage error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/admin/events
 * Recent usage events.
 * Query: ?limit=50&user_id=X
 */
router.get('/events', (req, res) => {
  try {
    const team = req.team;
    const limit = parseInt(req.query.limit, 10) || 50;
    const userId = req.query.user_id;

    const events = db.getRecentEvents({
      userId: userId || null,
      teamId: team.id,
      limit,
    });

    res.json({ events });
  } catch (err) {
    console.error('GET /events error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/admin/settings
 * Update team settings.
 * Body: { name?, credit_weights?, admin_password? }
 */
router.put('/settings', (req, res) => {
  try {
    const team = req.team;
    const { name, credit_weights, admin_password } = req.body;

    const updates = {};
    if (name !== undefined) updates.name = name;
    if (credit_weights !== undefined) updates.credit_weights = credit_weights;
    if (admin_password !== undefined) {
      updates.admin_password = hashPassword(admin_password);
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    db.updateTeam(team.id, updates);

    const updatedTeam = db.getTeam(team.id);
    res.json({
      team: {
        id: updatedTeam.id,
        name: updatedTeam.name,
        credit_weights: JSON.parse(updatedTeam.credit_weights),
      },
    });
  } catch (err) {
    console.error('PUT /settings error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
