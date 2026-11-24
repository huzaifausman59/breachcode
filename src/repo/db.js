'use strict';
/**
 * Returns the single shared better-sqlite3 Database instance.
 * Called once at startup; all repos import this module.
 *
 * WHY WAL mode:
 *   Allows concurrent reads while a write is in progress.
 *   Critical for the audit log path that writes on every request.
 *
 * WHY foreign_keys = ON:
 *   SQLite does not enforce FK constraints by default.
 *   We enable them so the DB itself catches dangling references,
 *   not just application code.
 */

const Database = require('better-sqlite3');
const path     = require('path');
const fs       = require('fs');
const config   = require('../config');
const logger   = require('../config/logger');

let _db = null;

function getDb() {
  if (_db) return _db;

  // Ensure the data directory exists.
  const dir = path.dirname(config.db.path);
  fs.mkdirSync(dir, { recursive: true });

  _db = new Database(config.db.path, {
    verbose: config.env === 'development' ? (sql) => logger.trace({ sql }, 'SQL') : undefined,
  });

  // Performance and correctness pragmas set once at open.
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  _db.pragma('busy_timeout = 5000'); // wait up to 5 s on locked DB

  logger.info({ dbPath: config.db.path }, 'Database opened');
  return _db;
}

module.exports = { getDb };
