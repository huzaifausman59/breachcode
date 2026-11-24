'use strict';
/**
 * User repository.
 * ALL database access for the users table lives here.
 * Parameterized queries only — no string concatenation into SQL (TH3).
 * Server-generated IDs only — never trust client-supplied IDs.
 */

const { v4: uuid }  = require('uuid');
const { getDb }     = require('./db');
const config        = require('../config');

function now() { return new Date().toISOString(); }

/**
 * Find a user by username (for login).
 * @param {string} username
 * @returns {object|null}
 */
function findByUsername(username) {
  return getDb()
    .prepare('SELECT * FROM users WHERE username = ? AND is_active = 1')
    .get(username) ?? null;
}

/**
 * Find a user by ID (for session restoration).
 * @param {string} id
 * @returns {object|null}
 */
function findById(id) {
  return getDb()
    .prepare('SELECT * FROM users WHERE id = ? AND is_active = 1')
    .get(id) ?? null;
}

/**
 * List all users (admin only). Returns safe fields only — no password_hash.
 */
function listUsers() {
  return getDb()
    .prepare(`
      SELECT id, username, role, is_active, failed_login_attempts,
             lockout_until, created_at, updated_at
      FROM users ORDER BY created_at ASC
    `)
    .all();
}

/**
 * Create a new user.
 * @param {{ username, password_hash, role }} data
 * @returns {object} created user (safe fields)
 */
function createUser({ username, password_hash, role }) {
  const id  = uuid();
  const ts  = now();
  getDb().prepare(`
    INSERT INTO users (id, username, password_hash, role, is_active, created_at, updated_at)
    VALUES (@id, @username, @password_hash, @role, 1, @ts, @ts)
  `).run({ id, username, password_hash, role, ts });
  return findSafeById(id);
}

/**
 * Update a user's role or active status (admin only).
 * @param {string} id
 * @param {{ role?, is_active? }} updates
 */
function updateUser(id, { role, is_active }) {
  const fields = [];
  const params = { id, ts: now() };

  if (role !== undefined)      { fields.push('role = @role');           params.role      = role; }
  if (is_active !== undefined) { fields.push('is_active = @is_active'); params.is_active = is_active ? 1 : 0; }

  if (fields.length === 0) return;
  fields.push('updated_at = @ts');

  getDb().prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = @id`).run(params);
}

/**
 * Record a failed login attempt.
 * Locks the account after reaching the configured threshold.
 * @param {string} id
 */
function recordFailedLogin(id) {
  const db      = getDb();
  const user    = db.prepare('SELECT failed_login_attempts FROM users WHERE id = ?').get(id);
  if (!user) return;

  const attempts = (user.failed_login_attempts || 0) + 1;
  const maxAttempts = config.rateLimit.loginMaxAttempts;

  let lockoutUntil = null;
  if (attempts >= maxAttempts) {
    const lockoutMs = config.rateLimit.loginLockoutMinutes * 60 * 1000;
    lockoutUntil = new Date(Date.now() + lockoutMs).toISOString();
  }

  db.prepare(`
    UPDATE users
    SET failed_login_attempts = @attempts, lockout_until = @lockoutUntil, updated_at = @ts
    WHERE id = @id
  `).run({ attempts, lockoutUntil, ts: now(), id });
}

/**
 * Reset failed login attempts on successful login.
 * @param {string} id
 */
function resetFailedLogins(id) {
  getDb().prepare(`
    UPDATE users
    SET failed_login_attempts = 0, lockout_until = NULL, updated_at = @ts
    WHERE id = @id
  `).run({ ts: now(), id });
}

/**
 * Return user fields safe to expose — never the password_hash.
 */
function findSafeById(id) {
  return getDb().prepare(`
    SELECT id, username, role, is_active, created_at, updated_at
    FROM users WHERE id = ?
  `).get(id) ?? null;
}

module.exports = {
  findByUsername,
  findById,
  findSafeById,
  listUsers,
  createUser,
  updateUser,
  recordFailedLogin,
  resetFailedLogins,
};
