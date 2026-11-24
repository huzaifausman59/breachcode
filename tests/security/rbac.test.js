'use strict';
/**
 * RBAC tests — TH6 (privilege escalation).
 * Verifies viewer and operator cannot access admin-only endpoints.
 * Verifies denied attempts are logged.
 */

const { test, before, after } = require('node:test');
const assert  = require('node:assert/strict');
const request = require('supertest');
const { setupTestDb, teardownTestDb } = require('../helpers/setup');

let app, seed;

before(async () => {
  setupTestDb('rbac');
  app  = require('../../src/app').createApp();
  seed = require('../../src/repo/seed');
  await seed.seed();
});

after(() => teardownTestDb());

async function getCsrf() {
  const res = await request(app).get('/api/v1/health');
  const setCookie = res.headers['set-cookie'] || [];
  const csrfCookie = setCookie.find(c => c.startsWith('__csrf='));
  const token = csrfCookie ? csrfCookie.split(';')[0].split('=')[1] : '';
  return { token, cookieHeader: setCookie.map(c => c.split(';')[0]).join('; ') };
}

async function loginAs(username, password) {
  const csrf = await getCsrf();
  const res  = await request(app)
    .post('/api/v1/auth/login')
    .set('Cookie', csrf.cookieHeader)
    .set('x-csrf-token', csrf.token)
    .send({ username, password });
  const cookies = (res.headers['set-cookie'] || []).map(c => c.split(';')[0]);
  return {
    cookies: [...cookies, ...csrf.cookieHeader.split('; ')].join('; '),
    csrfToken: res.body.csrfToken || csrf.token,
  };
}

// ── Unauthenticated ──────────────────────────────────────────────────────────

test('Unauthenticated request to admin endpoint returns 401', async () => {
  const res = await request(app).get('/api/v1/admin/users');
  assert.equal(res.status, 401);
  assert.equal(res.body.error.code, 'E_AUTH');
});

// ── Viewer cannot access admin or operator resources ─────────────────────────

test('Viewer cannot list users (TH6)', async () => {
  const { cookies } = await loginAs('viewer', 'Viewer@demo1');
  const res = await request(app)
    .get('/api/v1/admin/users')
    .set('Cookie', cookies);
  assert.equal(res.status, 403);
  assert.equal(res.body.error.code, 'E_FORBIDDEN');
});

test('Viewer cannot view audit log (TH6)', async () => {
  const { cookies } = await loginAs('viewer', 'Viewer@demo1');
  const res = await request(app)
    .get('/api/v1/admin/audit')
    .set('Cookie', cookies);
  assert.equal(res.status, 403);
});

test('Viewer cannot create users (TH6)', async () => {
  const { cookies, csrfToken } = await loginAs('viewer', 'Viewer@demo1');
  const res = await request(app)
    .post('/api/v1/admin/users')
    .set('Cookie', cookies)
    .set('x-csrf-token', csrfToken)
    .send({ username: 'newuser', password: 'Password123!', role: 'viewer', confirm: true });
  assert.equal(res.status, 403);
});

// ── Operator cannot access admin-only resources ──────────────────────────────

test('Operator cannot list users (TH6)', async () => {
  const { cookies } = await loginAs('operator', 'Operator@demo1');
  const res = await request(app)
    .get('/api/v1/admin/users')
    .set('Cookie', cookies);
  assert.equal(res.status, 403);
});

test('Operator cannot view audit log (TH6)', async () => {
  const { cookies } = await loginAs('operator', 'Operator@demo1');
  const res = await request(app)
    .get('/api/v1/admin/audit')
    .set('Cookie', cookies);
  assert.equal(res.status, 403);
});

// ── Admin can access admin resources ─────────────────────────────────────────

test('Admin can list users', async () => {
  const { cookies } = await loginAs('admin', 'Admin@demo1');
  const res = await request(app)
    .get('/api/v1/admin/users')
    .set('Cookie', cookies);
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.users));
});

test('Admin can view audit log', async () => {
  const { cookies } = await loginAs('admin', 'Admin@demo1');
  const res = await request(app)
    .get('/api/v1/admin/audit')
    .set('Cookie', cookies);
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.rows));
});

// ── Denied access is logged ───────────────────────────────────────────────────

test('Denied access attempt is recorded in audit log (TH6)', async () => {
  const { cookies } = await loginAs('viewer', 'Viewer@demo1');

  // Trigger a denied access.
  await request(app)
    .get('/api/v1/admin/users')
    .set('Cookie', cookies);

  // Now check audit log as admin.
  const { cookies: adminCookies } = await loginAs('admin', 'Admin@demo1');
  const auditRes = await request(app)
    .get('/api/v1/admin/audit?action=access.denied')
    .set('Cookie', adminCookies);

  assert.equal(auditRes.status, 200);
  assert.ok(auditRes.body.total > 0, 'Denied access must be logged');
  const deniedRow = auditRes.body.rows.find(r => r.action === 'access.denied');
  assert.ok(deniedRow, 'access.denied row must exist');
  assert.equal(deniedRow.outcome, 'denied');
});

test('Denied access response does not reveal the protected resource (TH6)', async () => {
  const { cookies } = await loginAs('viewer', 'Viewer@demo1');
  const res = await request(app)
    .get('/api/v1/admin/users')
    .set('Cookie', cookies);
  // Response must be generic — no mention of "users" or any internal detail.
  assert.equal(res.body.error.message, 'Access denied.');
});
