'use strict';
/**
 * Config loader.
 * Reads from environment variables (populated from .env by the caller
 * via `require('dotenv').config()` before this module loads).
 * Throws immediately if a required secret is missing — we want fail-fast,
 * not a server that starts with unsafe defaults.
 */

const path = require('path');

function required(name) {
  const val = process.env[name];
  if (!val || val === 'CHANGE_ME_BEFORE_RUNNING') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return val;
}

function optional(name, defaultVal) {
  return process.env[name] || defaultVal;
}

function int(name, defaultVal) {
  const raw = process.env[name];
  if (!raw) return defaultVal;
  const n = parseInt(raw, 10);
  if (isNaN(n)) throw new Error(`${name} must be an integer, got: ${raw}`);
  return n;
}

const config = {
  env: optional('NODE_ENV', 'development'),
  port: int('PORT', 3000),

  session: {
    secret: required('SESSION_SECRET'),
    idleMinutes: int('SESSION_IDLE_MINUTES', 30),
    absoluteHours: int('SESSION_ABSOLUTE_HOURS', 8),
  },

  db: {
    path: optional('DB_PATH', path.resolve('./data/breachcoach.db')),
  },

  smtp: {
    host: optional('SMTP_HOST', 'localhost'),
    port: int('SMTP_PORT', 1025),
    from: optional('SMTP_FROM', 'noreply@northwind-university.local'),
  },

  app: {
    baseUrl: optional('APP_BASE_URL', 'http://localhost:3000'),
    orgName: optional('ORG_NAME', 'Northwind University'),
  },

  rateLimit: {
    loginMaxAttempts: int('LOGIN_MAX_ATTEMPTS', 5),
    loginWindowMinutes: int('LOGIN_WINDOW_MINUTES', 15),
    loginLockoutMinutes: int('LOGIN_LOCKOUT_MINUTES', 30),
    apiMax: int('API_RATE_LIMIT', 100),
    apiWindowMinutes: int('API_RATE_WINDOW_MINUTES', 15),
  },

  upload: {
    maxBytes: int('MAX_UPLOAD_BYTES', 5 * 1024 * 1024), // 5 MB
  },
};

module.exports = config;
