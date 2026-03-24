'use strict';

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');

// JWT secret: from env or auto-generated per process lifetime
let jwtSecret = null;
function getJWTSecret() {
  if (jwtSecret) return jwtSecret;
  jwtSecret = process.env.JWT_SECRET || crypto.randomUUID();
  if (!process.env.JWT_SECRET) {
    console.warn('WARNING: JWT_SECRET not set. Generated a random secret. Sessions will not persist across restarts.');
  }
  return jwtSecret;
}

// ---- Password helpers ----

/**
 * Hash a plain-text password.
 * @param {string} plain
 * @returns {string} bcrypt hash
 */
function hashPassword(plain) {
  return bcrypt.hashSync(plain, 10);
}

/**
 * Verify a plain-text password against a bcrypt hash.
 * @param {string} plain
 * @param {string} hash
 * @returns {boolean}
 */
function verifyPassword(plain, hash) {
  return bcrypt.compareSync(plain, hash);
}

// ---- Token helpers ----

/**
 * Generate a unique token (UUID v4).
 * @returns {string}
 */
function generateToken() {
  return crypto.randomUUID();
}

// ---- JWT helpers ----

/**
 * Create a JWT for the admin session.
 * @param {object} payload - e.g., { teamId: '...' }
 * @param {string} [expiresIn] - default '24h'
 * @returns {string} signed JWT
 */
function createJWT(payload, expiresIn) {
  return jwt.sign(payload, getJWTSecret(), { expiresIn: expiresIn || '24h' });
}

/**
 * Verify and decode a JWT.
 * @param {string} token
 * @returns {object|null} decoded payload, or null if invalid
 */
function verifyJWT(token) {
  try {
    return jwt.verify(token, getJWTSecret());
  } catch {
    return null;
  }
}

// ---- Middleware ----

/**
 * Express middleware: Admin authentication.
 * Checks JWT from Authorization header (Bearer <token>) or cookie (jwt=<token>).
 * Sets req.team on success.
 */
function adminAuth(req, res, next) {
  let token = null;

  // Check Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  }

  // Fallback: check cookie
  if (!token && req.headers.cookie) {
    const cookies = parseCookies(req.headers.cookie);
    token = cookies.jwt || cookies.token;
  }

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const decoded = verifyJWT(token);
  if (!decoded || !decoded.teamId) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  const team = db.getTeam(decoded.teamId);
  if (!team) {
    return res.status(401).json({ error: 'Team not found' });
  }

  req.team = team;
  req.teamId = decoded.teamId;
  next();
}

/**
 * Express middleware: Hook authentication.
 * Checks auth_token from Authorization: Bearer header or request body.
 * Sets req.user on success.
 */
function hookAuth(req, res, next) {
  let authToken = null;

  // Check Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    authToken = authHeader.slice(7);
  }

  // Fallback: check request body
  if (!authToken && req.body && req.body.auth_token) {
    authToken = req.body.auth_token;
  }

  if (!authToken) {
    return res.status(401).json({ error: 'auth_token required' });
  }

  const user = db.getUserByToken(authToken);
  if (!user) {
    return res.status(401).json({ error: 'Invalid auth_token' });
  }

  // Attach user and their team
  req.user = user;
  req.team = db.getTeam(user.team_id);
  next();
}

/**
 * Parse a Cookie header string into an object.
 */
function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  cookieHeader.split(';').forEach(pair => {
    const [name, ...rest] = pair.trim().split('=');
    if (name) {
      cookies[name.trim()] = decodeURIComponent(rest.join('=').trim());
    }
  });
  return cookies;
}

module.exports = {
  hashPassword,
  verifyPassword,
  generateToken,
  createJWT,
  verifyJWT,
  adminAuth,
  hookAuth,
  getJWTSecret,
};
