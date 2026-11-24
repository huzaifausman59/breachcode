'use strict';
/**
 * Phase 1 tests — health endpoint + migration smoke test.
 * Uses node:test (built-in, no extra deps).
 */

const { test, before, after } = require('node:test');
const assert  = require('node:assert/strict');
const request = require('supertest');
const path    = require('path');
const fs      = require('fs');

// Use a temp DB so tests never touch the real data directory.
const TEST_DB = path.resolve('./data/test_phase1.db');
process.env.SESSION_SECRET = 'test-secret-do-not-use-in-production-64chars-padding-here-xx';
process.env.DB_PATH        = TEST_DB;
process.env.NODE_ENV       = 'test';

const { migrate } = require('../../src/repo/migrate');
const { createApp } = require('../../src/app');

let app;

before(() => {
  migrate();
  app = createApp();
});

after(() => {
  // Clean up test DB.
  try { fs.unlinkSync(TEST_DB); } catch (_) {}
  try { fs.unlinkSync(TEST_DB + '-shm'); } catch (_) {}
  try { fs.unlinkSync(TEST_DB + '-wal'); } catch (_) {}
});

test('GET /api/v1/health returns ok', async () => {
  const res = await request(app).get('/api/v1/health');
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'ok');
  assert.ok(typeof res.body.uptime === 'number');
});

test('Unknown route returns 404 with E_NOT_FOUND', async () => {
  const res = await request(app).get('/api/v1/this-does-not-exist');
  assert.equal(res.status, 404);
  assert.equal(res.body.error.code, 'E_NOT_FOUND');
});

test('Migration creates all required tables', () => {
  const { getDb } = require('../../src/repo/db');
  const db = getDb();

  const tables = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
    .all()
    .map(r => r.name);

  const required = [
    'users', 'sessions', 'templates', 'participants',
    'campaigns', 'campaign_recipients', 'events',
    'lessons', 'rules', 'results', 'audit_events',
  ];

  for (const t of required) {
    assert.ok(tables.includes(t), `Table '${t}' should exist after migration`);
  }
});

test('No stack traces in error responses', async () => {
  // Trigger the 404 handler.
  const res = await request(app).get('/api/v1/no-such-route-xyz');
  const body = JSON.stringify(res.body);
  assert.ok(!body.includes('at Object.'), 'Response must not contain stack trace');
  assert.ok(!body.includes('node_modules'), 'Response must not contain internal paths');
});

test('Response body has correct error shape', async () => {
  const res = await request(app).get('/api/v1/no-such-route-xyz');
  assert.ok(res.body.error, 'Must have error key');
  assert.ok(res.body.error.code, 'Must have error.code');
  assert.ok(res.body.error.message, 'Must have error.message');
});

test('Helmet security headers are present', async () => {
  const res = await request(app).get('/api/v1/health');
  // Helmet's most important headers:
  assert.ok(res.headers['x-frame-options'] || res.headers['content-security-policy'],
    'Helmet security headers should be present');
});
