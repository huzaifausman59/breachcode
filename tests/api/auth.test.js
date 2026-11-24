'use strict';
/**
 * Auth route tests — covers TH5 (session), TH9 (brute-force).
 * Also covers T3 (privacy: no password hash in responses).
 */

const { test, before, after } = require('node:test');
const assert  = require('node:assert/strict');
const request = require('supertest');
const { setupTestDb, teardownTestDb } = require('../helpers/setup');

let app, seed;

before(async () => {
  setupTestDb('auth');
  const mod = require('../../src/app');
  app  = mod.createApp();
  seed = require('../../src/repo/seed');
  await seed.seed();
});

after(() => teardownTestDb());

// Helper: get a CSRF token and cookie jar from a GET request.
async function getCsrf() {
  const res = await request(app).get('/api/v1/health');
  const setCookie = res.headers['set-cookie'] || [];
  const csrfCookie = setCookie.find(c => c.startsWith('__csrf='));
  const token = csrfCookie ? csrfCookie.split(';')[0].split('=')[1] : '';
  return { token, cookieHeader: setCookie.map(c => c.split(';')[0]).join('; ') };
}

// Helper: login and return session cookie + csrf token.
async function loginAs(username, password) {
  const csrf = await getCsrf();
  const res  = await request(app)
    .post('/api/v1/auth/login')
    .set('Cookie', csrf.cookieHeader)
    .set('x-csrf-token', csrf.token)
    .send({ username, password });
  const cookies = (res.headers['set-cookie'] || []).map(c => c.split(';')[0]);
  return { res, cookies: [...cookies, ...csrf.cookieHeader.split('; ')].join('; '), csrfToken: res.body.csrfToken || csrf.token };
}

// ── Login ───────────────────────────────────────────────────────────────────

test('POST /auth/login — success returns user and csrfToken', async () => {
  const { res } = await loginAs('operator', 'Operator@demo1');
  assert.equal(res.status, 200);
  assert.ok(res.body.user);
  assert.equal(res.body.user.username, 'operator');
  assert.equal(res.body.user.role, 'operator');
  assert.ok(res.body.csrfToken, 'Must return csrfToken for client');
});

test('POST /auth/login — response never contains password_hash (T3)', async () => {
  const { res } = await loginAs('operator', 'Operator@demo1');
  const body = JSON.stringify(res.body);
  assert.ok(!body.includes('password_hash'), 'password_hash must never appear in response');
  assert.ok(!body.includes('$argon2'),       'argon2 hash must never appear in response');
});

test('POST /auth/login — wrong password returns E_AUTH', async () => {
  const csrf = await getCsrf();
  const res  = await request(app)
    .post('/api/v1/auth/login')
    .set('Cookie', csrf.cookieHeader)
    .set('x-csrf-token', csrf.token)
    .send({ username: 'operator', password: 'WrongPassword1' });
  assert.equal(res.status, 401);
  assert.equal(res.body.error.code, 'E_AUTH');
});

test('POST /auth/login — unknown username returns same E_AUTH (no enumeration)', async () => {
  const csrf = await getCsrf();
  const res  = await request(app)
    .post('/api/v1/auth/login')
    .set('Cookie', csrf.cookieHeader)
    .set('x-csrf-token', csrf.token)
    .send({ username: 'doesnotexist', password: 'Password123' });
  assert.equal(res.status, 401);
  assert.equal(res.body.error.code, 'E_AUTH');
  // Error message must be identical to wrong-password message (prevents enumeration).
  assert.equal(res.body.error.message, 'Invalid username or password.');
});

test('POST /auth/login — missing fields returns E_VALIDATION', async () => {
  const csrf = await getCsrf();
  const res  = await request(app)
    .post('/api/v1/auth/login')
    .set('Cookie', csrf.cookieHeader)
    .set('x-csrf-token', csrf.token)
    .send({ username: 'op' }); // no password
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'E_VALIDATION');
  assert.ok(Array.isArray(res.body.error.fields));
});

// ── Session ─────────────────────────────────────────────────────────────────

test('GET /auth/me — returns user when logged in (TH5)', async () => {
  const { cookies, csrfToken } = await loginAs('viewer', 'Viewer@demo1');
  const res = await request(app)
    .get('/api/v1/auth/me')
    .set('Cookie', cookies);
  assert.equal(res.status, 200);
  assert.equal(res.body.user.username, 'viewer');
});

test('GET /auth/me — returns 401 when not logged in', async () => {
  const res = await request(app).get('/api/v1/auth/me');
  assert.equal(res.status, 401);
  assert.equal(res.body.error.code, 'E_AUTH');
});

test('POST /auth/logout — clears session', async () => {
  const { cookies, csrfToken } = await loginAs('operator', 'Operator@demo1');

  const logoutRes = await request(app)
    .post('/api/v1/auth/logout')
    .set('Cookie', cookies)
    .set('x-csrf-token', csrfToken);
  assert.equal(logoutRes.status, 200);

  // Using the same session cookie after logout should return 401.
  const meRes = await request(app)
    .get('/api/v1/auth/me')
    .set('Cookie', cookies);
  assert.equal(meRes.status, 401);
});

// ── CSRF ─────────────────────────────────────────────────────────────────────

test('POST /auth/login — missing CSRF token returns 403 (TH4)', async () => {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ username: 'operator', password: 'Operator@demo1' });
  // No x-csrf-token header and no __csrf cookie → rejected
  assert.equal(res.status, 403);
});

test('POST /auth/login — wrong CSRF token returns 403 (TH4)', async () => {
  const csrf = await getCsrf();
  const res  = await request(app)
    .post('/api/v1/auth/login')
    .set('Cookie', csrf.cookieHeader)
    .set('x-csrf-token', 'totally-wrong-token')
    .send({ username: 'operator', password: 'Operator@demo1' });
  assert.equal(res.status, 403);
});

// ── Account lockout (TH9) ────────────────────────────────────────────────────

test('Account lockout after 5 failed attempts (TH9)', async () => {
  // Use admin account for this test to avoid affecting operator tests above.
  const csrf = await getCsrf();

  // 5 failed attempts.
  for (let i = 0; i < 5; i++) {
    await request(app)
      .post('/api/v1/auth/login')
      .set('Cookie', csrf.cookieHeader)
      .set('x-csrf-token', csrf.token)
      .send({ username: 'admin', password: 'WrongPassword1' });
  }

  // 6th attempt should return E_RATE_LIMIT (locked out).
  const res = await request(app)
    .post('/api/v1/auth/login')
    .set('Cookie', csrf.cookieHeader)
    .set('x-csrf-token', csrf.token)
    .send({ username: 'admin', password: 'Admin@demo1' }); // correct password but locked

  assert.equal(res.status, 429);
  assert.equal(res.body.error.code, 'E_RATE_LIMIT');
  assert.ok(typeof res.body.error.retry_after === 'number');
});
