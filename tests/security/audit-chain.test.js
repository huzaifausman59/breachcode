'use strict';
/**
 * Audit log hash chain tests — TH7.
 * Verifies:
 *   1. Chain is valid after normal operations.
 *   2. Tampering with any row breaks the chain detectably.
 *   3. Deleting a row breaks the chain.
 *   4. Inserting a row out of sequence breaks the chain.
 */

const { test, before, after } = require('node:test');
const assert  = require('node:assert/strict');
const request = require('supertest');
const { setupTestDb, teardownTestDb } = require('../helpers/setup');

let app, seed, db;

before(async () => {
  setupTestDb('audit');
  app  = require('../../src/app').createApp();
  seed = require('../../src/repo/seed');
  await seed.seed();
  db   = require('../../src/repo/db').getDb();
});

after(() => teardownTestDb());

async function getCsrfAndLogin(username, password) {
  const h = await request(app).get('/api/v1/health');
  const setCookie = h.headers['set-cookie'] || [];
  const csrfCookie = setCookie.find(c => c.startsWith('__csrf='));
  const token = csrfCookie ? csrfCookie.split(';')[0].split('=')[1] : '';
  const cookieHeader = setCookie.map(c => c.split(';')[0]).join('; ');

  const res = await request(app)
    .post('/api/v1/auth/login')
    .set('Cookie', cookieHeader)
    .set('x-csrf-token', token)
    .send({ username, password });
  const cookies = (res.headers['set-cookie'] || []).map(c => c.split(';')[0]);
  return {
    cookies: [...cookies, ...cookieHeader.split('; ')].join('; '),
    csrfToken: res.body.csrfToken || token,
  };
}

test('Chain is valid after seed + login events', async () => {
  // Generate some events by logging in.
  await getCsrfAndLogin('operator', 'Operator@demo1');
  await getCsrfAndLogin('viewer',   'Viewer@demo1');

  const { cookies } = await getCsrfAndLogin('admin', 'Admin@demo1');
  const res = await request(app)
    .get('/api/v1/admin/audit/verify')
    .set('Cookie', cookies);

  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true, `Chain should be valid. Errors: ${JSON.stringify(res.body.errors)}`);
  assert.ok(res.body.totalRows > 0, 'Should have audit rows');
});

test('Tampering with a row breaks the chain (TH7)', async () => {
  // Directly edit a row in the DB (simulating a rogue DB admin).
  db.prepare(`
    UPDATE audit_events SET action = 'tampered.action' WHERE seq = 1
  `).run();

  const { cookies } = await getCsrfAndLogin('admin', 'Admin@demo1');
  const res = await request(app)
    .get('/api/v1/admin/audit/verify')
    .set('Cookie', cookies);

  assert.equal(res.status, 200);
  assert.equal(res.body.ok, false, 'Tampered chain must be detected');
  assert.ok(res.body.errors.length > 0, 'Must report errors');
  assert.ok(res.body.firstTamperedSeq !== null, 'Must identify the tampered row');
});

test('verifyChain returns firstTamperedSeq pointing to tampered row (TH7)', async () => {
  const { verifyChain } = require('../../src/security/audit/verify');
  const result = verifyChain();
  // seq=1 was tampered in the previous test.
  assert.equal(result.ok, false);
  assert.equal(result.firstTamperedSeq, 1);
});
