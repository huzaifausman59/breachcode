'use strict';
const { test } = require('node:test');
const assert   = require('node:assert/strict');

test('Config loads successfully with valid env vars', () => {
  process.env.SESSION_SECRET = 'valid-secret-at-least-32-chars-long-padding-here-xxxxxxxxxx';
  process.env.DB_PATH        = './data/test.db';
  process.env.NODE_ENV       = 'test';

  // Re-require to pick up env vars (module caches, so we just check no throw).
  // If config throws, this test fails.
  const config = require('../../src/config');
  assert.equal(config.env, 'test');
  assert.equal(typeof config.port, 'number');
  assert.ok(config.session.secret.length > 0);
});

test('createError produces correct shape', () => {
  const { createError } = require('../../src/api/errorHandler');
  const err = createError('E_VALIDATION', 'Input failed', { fields: [{ field: 'email', message: 'Invalid' }] });
  assert.equal(err.code, 'E_VALIDATION');
  assert.equal(err.status, 400);
  assert.ok(err.isOp);
  assert.deepEqual(err.extra.fields[0].field, 'email');
});

test('createError for E_INTERNAL has status 500', () => {
  const { createError } = require('../../src/api/errorHandler');
  const err = createError('E_INTERNAL', 'Server error');
  assert.equal(err.status, 500);
});
