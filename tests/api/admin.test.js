'use strict';
/**
 * Admin user management tests.
 * Covers: user CRUD, confirm gate, no password_hash exposure.
 */

const { test, before, after } = require('node:test');
const assert  = require('node:assert/strict');
const request = require('supertest');
const { setupTestDb, teardownTestDb } = require('../helpers/setup');

let app, seed;

before(async () => {
  setupTestDb('admin');
  app  = require('../../src/app').createApp();
  seed = require('../../src/repo/seed');
  await seed.seed();
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

test('Admin can create a new user', async () => {
  const { cookies, csrfToken } = await getCsrfAndLogin('admin', 'Admin@demo1');
  const res = await request(app)
    .post('/api/v1/admin/users')
    .set('Cookie', cookies)
    .set('x-csrf-token', csrfToken)
    .send({ username: 'newoperator', password: 'NewOp@pass123', role: 'operator' });
  assert.equal(res.status, 201);
  assert.equal(res.body.user.username, 'newoperator');
  assert.equal(res.body.user.role, 'operator');
  // Must never expose password_hash.
  assert.ok(!res.body.user.password_hash, 'password_hash must not be in response');
});

test('Duplicate username returns E_CONFLICT', async () => {
  const { cookies, csrfToken } = await getCsrfAndLogin('admin', 'Admin@demo1');
  await request(app)
    .post('/api/v1/admin/users')
    .set('Cookie', cookies)
    .set('x-csrf-token', csrfToken)
    .send({ username: 'dupuser', password: 'DupUser@pass1', role: 'viewer' });

  const res = await request(app)
    .post('/api/v1/admin/users')
    .set('Cookie', cookies)
    .set('x-csrf-token', csrfToken)
    .send({ username: 'dupuser', password: 'DupUser@pass1', role: 'viewer' });
  assert.equal(res.status, 409);
  assert.equal(res.body.error.code, 'E_CONFLICT');
});

test('Admin can update user role', async () => {
  const { cookies, csrfToken } = await getCsrfAndLogin('admin', 'Admin@demo1');

  // First create a user to update.
  const createRes = await request(app)
    .post('/api/v1/admin/users')
    .set('Cookie', cookies)
    .set('x-csrf-token', csrfToken)
    .send({ username: 'roleuser', password: 'Role@user123', role: 'viewer' });
  const userId = createRes.body.user.id;

  const updateRes = await request(app)
    .put(`/api/v1/admin/users/${userId}`)
    .set('Cookie', cookies)
    .set('x-csrf-token', csrfToken)
    .send({ role: 'operator', confirm: true });
  assert.equal(updateRes.status, 200);
  assert.equal(updateRes.body.user.role, 'operator');
});

test('Update without confirm:true returns E_CONFIRM', async () => {
  const { cookies, csrfToken } = await getCsrfAndLogin('admin', 'Admin@demo1');

  const createRes = await request(app)
    .post('/api/v1/admin/users')
    .set('Cookie', cookies)
    .set('x-csrf-token', csrfToken)
    .send({ username: 'confirmuser', password: 'Confirm@pass1', role: 'viewer' });
  const userId = createRes.body.user.id;

  const res = await request(app)
    .put(`/api/v1/admin/users/${userId}`)
    .set('Cookie', cookies)
    .set('x-csrf-token', csrfToken)
    .send({ role: 'operator' }); // no confirm
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'E_VALIDATION');
});

test('Admin cannot disable their own account', async () => {
  const { cookies, csrfToken } = await getCsrfAndLogin('admin', 'Admin@demo1');
  const meRes = await request(app).get('/api/v1/auth/me').set('Cookie', cookies);
  const adminId = meRes.body.user.id;

  const res = await request(app)
    .put(`/api/v1/admin/users/${adminId}`)
    .set('Cookie', cookies)
    .set('x-csrf-token', csrfToken)
    .send({ is_active: false, confirm: true });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'E_VALIDATION');
});

test('User list never includes password_hash (T3)', async () => {
  const { cookies } = await getCsrfAndLogin('admin', 'Admin@demo1');
  const res = await request(app).get('/api/v1/admin/users').set('Cookie', cookies);
  assert.equal(res.status, 200);
  const body = JSON.stringify(res.body);
  assert.ok(!body.includes('password_hash'), 'password_hash must never appear in user list');
  assert.ok(!body.includes('$argon2'),       'argon2 hash must never appear in user list');
});

test('Update non-existent user returns 404', async () => {
  const { cookies, csrfToken } = await getCsrfAndLogin('admin', 'Admin@demo1');
  const res = await request(app)
    .put('/api/v1/admin/users/00000000-0000-0000-0000-000000000000')
    .set('Cookie', cookies)
    .set('x-csrf-token', csrfToken)
    .send({ role: 'viewer', confirm: true });
  assert.equal(res.status, 404);
});
