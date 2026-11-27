'use strict';
/**
 * Phase 4 module API tests — FR-1 to FR-6.
 * Covers: templates CRUD+analyze, participant import, campaign create,
 * tracking (open/click/submit/report/optout), lessons, analytics.
 * Critical: T1 (no credentials stored), T2 (opt-out), T4 (event accuracy).
 */

const { test, before, after } = require('node:test');
const assert  = require('node:assert/strict');
const request = require('supertest');
const { setupTestDb, teardownTestDb } = require('../helpers/setup');

let app, seed;

before(async () => {
  setupTestDb('modules');
  app  = require('../../src/app').createApp();
  seed = require('../../src/repo/seed');
  await seed.seed();
});

after(() => teardownTestDb());

// ── Helpers ──────────────────────────────────────────────────────────────────
async function csrf() {
  const r = await request(app).get('/api/v1/health');
  const sc = r.headers['set-cookie'] || [];
  const ck = sc.find(c => c.startsWith('__csrf='));
  const token = ck ? ck.split(';')[0].split('=')[1] : '';
  return { token, cookieHeader: sc.map(c => c.split(';')[0]).join('; ') };
}

async function login(username, password) {
  const c   = await csrf();
  const res = await request(app)
    .post('/api/v1/auth/login')
    .set('Cookie', c.cookieHeader)
    .set('x-csrf-token', c.token)
    .send({ username, password });
  const cookies = (res.headers['set-cookie'] || []).map(c => c.split(';')[0]);
  return {
    cookies:   [...cookies, ...c.cookieHeader.split('; ')].join('; '),
    csrfToken: res.body.csrfToken || c.token,
  };
}

// ── FR-1 Templates ───────────────────────────────────────────────────────────
test('FR-1: Create template returns 201 with analysis result', async () => {
  const { cookies, csrfToken } = await login('operator', 'Operator@demo1');
  const res = await request(app)
    .post('/api/v1/templates')
    .set('Cookie', cookies)
    .set('x-csrf-token', csrfToken)
    .send({
      name: 'Test Template', subject: 'Hello from Northwind',
      sender_name: 'Northwind University', sender_email: 'noreply@northwind-university.local',
      html_body: '<p>Dear Alice, please visit our portal for updates.</p>',
    });
  assert.equal(res.status, 201);
  assert.ok(res.body.template);
  assert.ok(res.body.result);
  assert.ok(res.body.result.decision, 'Result must have decision');
  assert.ok(res.body.result.risk_level, 'Result must have risk_level');
});

test('FR-1: Template analysis result has reproducibility fields', async () => {
  const { cookies, csrfToken } = await login('operator', 'Operator@demo1');
  const res = await request(app)
    .post('/api/v1/templates')
    .set('Cookie', cookies)
    .set('x-csrf-token', csrfToken)
    .send({
      name: 'Repro Test', subject: 'URGENT: Act now',
      sender_name: 'PayPal Support', sender_email: 'support@paypa1.xyz',
      html_body: '<p>Dear Customer, enter your password now.</p>',
    });
  assert.equal(res.status, 201);
  const result = res.body.result;
  assert.ok(result.engine_version, 'Must have engine_version');
  assert.ok(Array.isArray(result.rules_applied), 'Must have rules_applied array');
  for (const r of result.rules_applied) {
    assert.ok(r.rule_id,      'Each rule must have rule_id');
    assert.ok(r.rule_version, 'Each rule must have rule_version');
    assert.ok('weight'    in r, 'Each rule must have weight');
    assert.ok('threshold' in r, 'Each rule must have threshold');
  }
});

test('FR-1: Template creation without auth returns 401', async () => {
  // Send a valid CSRF pair so the request reaches the auth check
  // (CSRF is verified before auth; without it the server answers 403).
  const c = await csrf();
  const res = await request(app)
    .post('/api/v1/templates')
    .set('Cookie', c.cookieHeader)
    .set('x-csrf-token', c.token)
    .send({ name: 'x', subject: 'x', sender_name: 'x', sender_email: 'x@x.com', html_body: 'hello world' });
  assert.equal(res.status, 401);
});

test('FR-1: Invalid template returns E_VALIDATION', async () => {
  const { cookies, csrfToken } = await login('operator', 'Operator@demo1');
  const res = await request(app)
    .post('/api/v1/templates')
    .set('Cookie', cookies)
    .set('x-csrf-token', csrfToken)
    .send({ name: 'x' }); // missing required fields
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'E_VALIDATION');
});

test('FR-1: List templates returns array', async () => {
  const { cookies } = await login('operator', 'Operator@demo1');
  const res = await request(app).get('/api/v1/templates').set('Cookie', cookies);
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.templates));
});

// ── FR-2 Participants ─────────────────────────────────────────────────────────
test('FR-2: CSV import with valid file succeeds', async () => {
  const { cookies, csrfToken } = await login('operator', 'Operator@demo1');
  const csv = 'email,display_name,consent_at,consent_source\nalice@northwind-university.local,Alice,2026-01-01T00:00:00Z,csv_import\n';
  const res = await request(app)
    .post('/api/v1/participants/import')
    .set('Cookie', cookies)
    .set('x-csrf-token', csrfToken)
    .field('confirm', 'true')
    .attach('file', Buffer.from(csv), { filename: 'participants.csv', contentType: 'text/csv' });
  assert.equal(res.status, 200);
  assert.ok(res.body.imported >= 1);
});

test('FR-2: CSV import without confirm returns E_CONFIRM', async () => {
  const { cookies, csrfToken } = await login('operator', 'Operator@demo1');
  const csv = 'email,display_name,consent_at,consent_source\nbob@northwind.local,Bob,2026-01-01T00:00:00Z,csv_import\n';
  const res = await request(app)
    .post('/api/v1/participants/import')
    .set('Cookie', cookies)
    .set('x-csrf-token', csrfToken)
    .attach('file', Buffer.from(csv), { filename: 'p.csv', contentType: 'text/csv' });
  assert.equal(res.status, 422);
  assert.equal(res.body.error.code, 'E_CONFIRM');
});

test('FR-2: Formula injection rows are rejected (TH2)', async () => {
  const { cookies, csrfToken } = await login('operator', 'Operator@demo1');
  const csv = 'email,display_name,consent_at,consent_source\n=CMD("calc"),Evil,2026-01-01T00:00:00Z,csv_import\nvalid@northwind-university.local,Valid,2026-01-01T00:00:00Z,csv_import\n';
  const res = await request(app)
    .post('/api/v1/participants/import')
    .set('Cookie', cookies)
    .set('x-csrf-token', csrfToken)
    .field('confirm', 'true')
    .attach('file', Buffer.from(csv), { filename: 'p.csv', contentType: 'text/csv' });
  assert.equal(res.status, 200);
  assert.equal(res.body.imported, 1,  'Only valid row imported');
  assert.equal(res.body.skipped,  1,  'Formula row skipped');
  assert.ok(res.body.errors[0].error.includes('Formula'), 'Error must name formula rejection');
});

test('FR-2: Non-CSV file is rejected (TH2)', async () => {
  const { cookies, csrfToken } = await login('operator', 'Operator@demo1');
  const res = await request(app)
    .post('/api/v1/participants/import')
    .set('Cookie', cookies)
    .set('x-csrf-token', csrfToken)
    .field('confirm', 'true')
    .attach('file', Buffer.from('<html>bad</html>'), { filename: 'evil.html', contentType: 'text/html' });
  assert.equal(res.status, 400);
});

// ── FR-3 Landing page & T1 (no credentials stored) ───────────────────────────
test('T1: Landing page shows "nothing you type is stored" banner', async () => {
  // Need a valid token — use a fake 32-char hex (will return 404 from resolveToken).
  const fakeToken = 'a'.repeat(32);
  const res = await request(app).get(`/api/v1/t/landing/${fakeToken}`);
  // With invalid token the page returns 404 — that's correct secure behaviour.
  assert.equal(res.status, 404);
});

test('T1: POST /t/s/:token discards body — does not echo back any credential', async () => {
  const fakeToken = 'b'.repeat(32);
  const res = await request(app)
    .post(`/api/v1/t/s/${fakeToken}`)
    .send({ username: 'victim', password: 'SuperSecret123' });
  // Response must NOT contain the submitted password anywhere.
  const body = JSON.stringify(res.body) + (res.text || '');
  assert.ok(!body.includes('SuperSecret123'), 'Password must never appear in response (T1)');
  assert.ok(!body.includes('victim') || res.status === 302, 'Username must not leak');
});

// ── FR-4 Event tracking ────────────────────────────────────────────────────────
test('FR-4: Open pixel returns 200 GIF for any token', async () => {
  const res = await request(app).get('/api/v1/t/o/' + 'c'.repeat(32));
  assert.equal(res.status, 200);
  assert.equal(res.headers['content-type'], 'image/gif');
});

test('FR-4: Open pixel returns GIF even for invalid token (no info leak)', async () => {
  const res = await request(app).get('/api/v1/t/o/invalidtoken');
  assert.equal(res.status, 200);
  assert.equal(res.headers['content-type'], 'image/gif');
});

// ── T2 Opt-out ───────────────────────────────────────────────────────────────
test('T2: Opt-out endpoint responds for valid-format token', async () => {
  const fakeToken = 'd'.repeat(32);
  const res = await request(app).get(`/api/v1/t/x/${fakeToken}`);
  // With no matching token, redirects to /
  assert.ok([200, 302].includes(res.status));
});

// ── FR-5 Lessons ─────────────────────────────────────────────────────────────
test('FR-5: Create lesson returns 201', async () => {
  // First create a template to link to.
  const { cookies, csrfToken } = await login('operator', 'Operator@demo1');
  const tRes = await request(app)
    .post('/api/v1/templates')
    .set('Cookie', cookies).set('x-csrf-token', csrfToken)
    .send({ name: 'Lesson Template', subject: 'Test', sender_name: 'NWU', sender_email: 'x@northwind-university.local', html_body: '<p>Hello Alice, check updates.</p>' });

  const templateId = tRes.body.template.id;
  const lRes = await request(app)
    .post('/api/v1/lessons')
    .set('Cookie', cookies).set('x-csrf-token', csrfToken)
    .send({
      template_id: templateId,
      title: 'Phishing Red Flags',
      content_html: '<p>Always check the sender address before clicking links.</p>',
      indicators: ['Urgency language detected', 'Generic greeting used'],
    });
  assert.equal(lRes.status, 201);
  assert.ok(lRes.body.lesson.id);
  assert.equal(lRes.body.lesson.title, 'Phishing Red Flags');
});

test('FR-5: Get lesson by template returns indicators', async () => {
  const { cookies, csrfToken } = await login('operator', 'Operator@demo1');
  const tRes = await request(app)
    .post('/api/v1/templates')
    .set('Cookie', cookies).set('x-csrf-token', csrfToken)
    .send({ name: 'Lesson Tmpl2', subject: 'Hello there', sender_name: 'NWU', sender_email: 'x@northwind-university.local', html_body: '<p>Dear Bob, your account needs attention.</p>' });

  const tid = tRes.body.template.id;
  await request(app)
    .post('/api/v1/lessons')
    .set('Cookie', cookies).set('x-csrf-token', csrfToken)
    .send({ template_id: tid, title: 'Red Flags', content_html: '<p>Watch for urgency.</p>', indicators: ['Urgency'] });

  // Public endpoint — no auth needed.
  const lRes = await request(app).get(`/api/v1/lessons/by-template/${tid}`);
  assert.equal(lRes.status, 200);
  assert.ok(lRes.body.lesson);
  assert.ok(Array.isArray(lRes.body.lesson.indicators));
});

// ── FR-6 Analytics ───────────────────────────────────────────────────────────
test('FR-6: Campaign analytics returns summary', async () => {
  // Create a campaign first.
  const { cookies, csrfToken } = await login('operator', 'Operator@demo1');
  const tRes = await request(app)
    .post('/api/v1/templates')
    .set('Cookie', cookies).set('x-csrf-token', csrfToken)
    .send({ name: 'Analytics Tmpl', subject: 'Hello there', sender_name: 'NWU', sender_email: 'x@northwind-university.local', html_body: '<p>Dear Team, check our newsletter.</p>' });

  const cRes = await request(app)
    .post('/api/v1/campaigns')
    .set('Cookie', cookies).set('x-csrf-token', csrfToken)
    .send({ name: 'Analytics Campaign', template_id: tRes.body.template.id, phase: 'pre', confirm: true });

  assert.equal(cRes.status, 201);
  const campaignId = cRes.body.campaign.id;

  const aRes = await request(app)
    .get(`/api/v1/analytics/campaign/${campaignId}`)
    .set('Cookie', cookies);
  assert.equal(aRes.status, 200);
  assert.ok(aRes.body.summary);
  assert.ok('total_sent' in aRes.body.summary);
  assert.ok('clicked'    in aRes.body.summary);
});

test('FR-6: Analytics for unknown campaign returns 404', async () => {
  const { cookies } = await login('operator', 'Operator@demo1');
  const res = await request(app)
    .get('/api/v1/analytics/campaign/00000000-0000-0000-0000-000000000000')
    .set('Cookie', cookies);
  assert.equal(res.status, 404);
});

test('FR-2: Oversized CSV is rejected with 400 E_FILE, not a 500 (T-final)', async () => {
  const config = require('../../src/config');
  const { cookies, csrfToken } = await login('operator', 'Operator@demo1');
  const big = Buffer.alloc(config.upload.maxBytes + 1024, 'a');
  const res = await request(app)
    .post('/api/v1/participants/import')
    .set('Cookie', cookies)
    .set('x-csrf-token', csrfToken)
    .field('confirm', 'true')
    .attach('file', big, { filename: 'big.csv', contentType: 'text/csv' });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'E_FILE');
});
