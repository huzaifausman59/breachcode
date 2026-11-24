'use strict';
/**
 * Shared test setup helpers.
 * Each test file calls setupTestDb() in before() and teardownTestDb() in after().
 *
 * WHY a fresh DB per test file:
 *   Tests must be independent. A leftover locked account or audit row
 *   from one test must not affect another. Each file gets its own
 *   uniquely-named SQLite file that is deleted after the suite.
 */

const path = require('path');
const fs   = require('fs');

let _dbPath = null;

/**
 * Configure env vars and run migrations for a test-isolated DB.
 * Call in before().
 * @param {string} label - unique label so parallel test files don't collide
 */
function setupTestDb(label = 'default') {
  _dbPath = path.resolve(`./data/test_${label}_${process.pid}.db`);

  process.env.SESSION_SECRET = 'test-secret-minimum-32-chars-padding-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
  process.env.DB_PATH        = _dbPath;
  process.env.NODE_ENV       = 'test';
  process.env.PORT            = '0'; // random port, not used in tests

  // Clear module cache so db.js picks up the new DB_PATH.
  // This is necessary because Node caches `require()` results.
  _clearModuleCache();

  const { migrate } = require('../../src/repo/migrate');
  migrate();
}

/**
 * Delete the test DB files. Call in after().
 */
function teardownTestDb() {
  _clearModuleCache();
  if (!_dbPath) return;
  for (const suffix of ['', '-shm', '-wal']) {
    try { fs.unlinkSync(_dbPath + suffix); } catch (_) {}
  }
}

function _clearModuleCache() {
  // Remove all breachcoach src modules from cache so each test file
  // gets a fresh DB connection pointing to its own test DB file.
  for (const key of Object.keys(require.cache)) {
    if (key.includes('/breachcoach/src/') || key.includes('/breachcoach/tests/')) {
      delete require.cache[key];
    }
  }
}

module.exports = { setupTestDb, teardownTestDb };
