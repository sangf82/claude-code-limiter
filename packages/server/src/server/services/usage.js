'use strict';

const db = require('../db');

/**
 * Record a usage event (one completed turn).
 * @param {string} userId
 * @param {string} model - opus | sonnet | haiku | default
 * @param {number} creditCost - cost from credit_weights
 * @param {string} [timestamp] - ISO string, defaults to now
 * @param {string} [source] - 'hook' | 'server', defaults to 'hook'
 */
function recordEvent(userId, model, creditCost, timestamp, source) {
  return db.recordUsage({
    userId,
    model,
    creditCost,
    timestamp: timestamp || new Date().toISOString(),
    source: source || 'hook',
  });
}

/**
 * Get usage counts by model for a user within a window.
 * @param {string} userId
 * @param {string} windowType - daily | weekly | monthly | sliding_24h
 * @param {string} [tz] - IANA timezone
 * @returns {{ opus: number, sonnet: number, haiku: number, default: number }}
 */
function getUsageByWindow(userId, windowType, tz) {
  const windowStart = db.calculateWindowStart(windowType, tz);
  return db.getUsage(userId, windowStart);
}

/**
 * Get a full usage summary for a user across all windows.
 * @param {string} userId
 * @param {string} [tz] - IANA timezone
 * @returns {{ daily: object, weekly: object, monthly: object, sliding_24h: object }}
 */
function getUsageSummary(userId, tz) {
  const windows = ['daily', 'weekly', 'monthly', 'sliding_24h'];
  const summary = {};
  for (const w of windows) {
    const data = db.getUsageForWindow(userId, w, tz);
    summary[w] = {
      counts: data.counts,
      totalCredits: data.totalCredits,
      windowStart: data.windowStart,
    };
  }
  return summary;
}

/**
 * Get remaining credit balance for a user.
 * @param {string} userId
 * @param {object} creditWeights - { opus: 10, sonnet: 3, haiku: 1 }
 * @param {string} windowType - daily | weekly | monthly | sliding_24h
 * @param {number} budget - total credit budget
 * @param {string} [tz] - IANA timezone
 * @returns {{ balance: number, used: number, budget: number }}
 */
function getCreditBalance(userId, creditWeights, windowType, budget, tz) {
  const windowStart = db.calculateWindowStart(windowType, tz);
  const data = db.getUsageWithCredits(userId, windowStart);
  const used = data.totalCredits;
  const balance = Math.max(0, budget - used);
  return { balance, used, budget };
}

/**
 * Delete usage events older than N days.
 * @param {number} days
 * @returns {{ changes: number }}
 */
function cleanupOldEvents(days) {
  return db.cleanupOldEvents(days || 90);
}

module.exports = {
  recordEvent,
  getUsageByWindow,
  getUsageSummary,
  getCreditBalance,
  cleanupOldEvents,
};
