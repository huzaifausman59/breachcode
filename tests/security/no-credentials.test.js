'use strict';
/**
 * T1 — No credential collection.
 * T2 — Opt-out flow.
 * TH11 — Emails only to consented participants.
 */

const { test, before, after } = require('node:test');
const assert  = require('node:assert/strict');
const request = require('supertest');
const { setupTestDb, teardownTestDb } = require('../helpers/setup');

let app, seed, db;

before(async () => {
  setupTestDb('nocreds');
  app  = require('../../src/app').createApp();
  seed = require('../../src/repo/seed');
  await seed.seed();
  db   = require('../../src/repo/db').getDb();
});

after(() => teardownTestDb());

// ── T1: No credential storage ─────────────────────────────────────────────────

test('T1: POST /t/s/:token never stores anything from request body', async () => {
  const fakeToken = 'e'.repeat(32);

  await request(app)
    .post(`/api/v1/t/s/${fakeToken}`)
    .send({ username: 'victim@example.com', password: 'MyP@ssw0rd123' });

  // Verify nothing was stored in events table containing the password.
  const events = db.prepare('SELECT * FROM events').all();
  const allData = JSON.stringify(events);
  assert.ok(!allData.includes('MyP@ssw0rd123'), 'Password must NEVER appear in events table');
  assert.ok(!allData.includes('victim@example.com') || events.length === 0,
    'Email must not be stored in events (only ip_hash allowed)');
});

test('T1: Audit log does not contain submitted passwords', async () => {
  const fakeToken = 'f'.repeat(32);

  await request(app)
    .post(`/api/v1/t/s/${fakeToken}`)
    .send({ username: 'user', password: 'AnotherSecret99' });

  const audit = db.prepare('SELECT detail FROM audit_events').all();
  for (const row of audit) {
    assert.ok(
      !row.detail.includes('AnotherSecret99'),
      'Password must never appear in audit log',
    );
  }
});

test('T1: Landing page HTML contains "nothing you type is stored" (banner check)', async () => {
  // Insert a real participant and campaign recipient to get a valid token.
  const { upsertParticipant } = require('../../src/repo/participantRepo');
  const { createCampaign, createRecipient, findRecipientByToken } = require('../../src/repo/campaignRepo');
  const { createTemplate } = require('../../src/repo/templateRepo');
  const crypto = require('crypto');

  const p = upsertParticipant({
    email: 'landing-test@northwind-university.local',
    consent_at: '2026-01-01T00:00:00Z',
    consent_source: 'csv_import',
  });

  const t = createTemplate({
    name: 'LP Test', subject: 'Test', sender_name: 'NWU',
    sender_email: 'x@northwind-university.local',
    html_body: '<p>Test</p>', created_by: null,
  });

  const c = createCampaign({ name: 'LP Campaign', template_id: t.id, phase: 'pre', created_by: null });

  const token = crypto.randomBytes(16).toString('hex');
  createRecipient({ campaign_id: c.id, participant_id: p.id, token });

  const res = await request(app).get(`/api/v1/t/landing/${token}`);
  assert.equal(res.status, 200);
  assert.ok(
    res.text.toLowerCase().includes('nothing you type is stored') ||
    res.text.toLowerCase().includes('training simulation'),
    'Landing page must display the training simulation banner',
  );
  assert.ok(!res.text.includes('SuperSecret'), 'Must not echo back any credential');
});

// ── T2: Opt-out flow ──────────────────────────────────────────────────────────

test('T2: Opt-out sets opt_out_at and consent_status=withdrawn', async () => {
  const crypto = require('crypto');
  const { upsertParticipant, findByEmail } = require('../../src/repo/participantRepo');
  const { createCampaign, createRecipient } = require('../../src/repo/campaignRepo');
  const { createTemplate } = require('../../src/repo/templateRepo');

  const p = upsertParticipant({
    email: 'optout-test@northwind-university.local',
    consent_at: '2026-01-01T00:00:00Z',
    consent_source: 'csv_import',
  });

  const t = createTemplate({
    name: 'Optout Tmpl', subject: 'Hi', sender_name: 'NWU',
    sender_email: 'x@northwind-university.local',
    html_body: '<p>Test</p>', created_by: null,
  });

  const c = createCampaign({ name: 'Optout Campaign', template_id: t.id, phase: 'pre', created_by: null });
  const token = crypto.randomBytes(16).toString('hex');
  createRecipient({ campaign_id: c.id, participant_id: p.id, token });

  // Trigger opt-out.
  const res = await request(app).get(`/api/v1/t/x/${token}`);
  assert.ok([200, 302].includes(res.status));

  // Verify DB state.
  const updated = findByEmail('optout-test@northwind-university.local');
  assert.equal(updated.consent_status, 'withdrawn', 'consent_status must be withdrawn');
  assert.ok(updated.opt_out_at, 'opt_out_at must be set');
});

test('T2: Opted-out participant blocked by consent policy', () => {
  const { checkConsent } = require('../../src/security/engine/consentPolicy');
  const result = checkConsent({
    consent_at: '2026-01-01T00:00:00Z',
    consent_status: 'withdrawn',
    consent_source: 'csv_import',
    opt_out_at: '2026-06-01T00:00:00Z',
  });
  assert.equal(result.permitted, false);
  assert.ok(result.reason.includes('opted out'));
});

// ── TH11: Consent enforcement ──────────────────────────────────────────────────

test('TH11: filterConsented blocks opted-out participants from send list', () => {
  const { filterConsented } = require('../../src/security/engine/consentPolicy');
  const participants = [
    { id: '1', consent_at: '2026-01-01T00:00:00Z', consent_status: 'active',    consent_source: 'csv_import', opt_out_at: null },
    { id: '2', consent_at: '2026-01-01T00:00:00Z', consent_status: 'withdrawn', consent_source: 'csv_import', opt_out_at: '2026-06-01T00:00:00Z' },
    { id: '3', consent_at: null,                   consent_status: 'active',    consent_source: 'csv_import', opt_out_at: null },
  ];
  const { permitted, blocked } = filterConsented(participants);
  assert.equal(permitted.length, 1, 'Only 1 participant has valid consent');
  assert.equal(blocked.length,   2, '2 participants must be blocked');
});

test('T1/TH: Landing page HTML-escapes operator-supplied template text', async () => {
  const { upsertParticipant } = require('../../src/repo/participantRepo');
  const { createCampaign, createRecipient } = require('../../src/repo/campaignRepo');
  const { createTemplate } = require('../../src/repo/templateRepo');
  const crypto = require('crypto');

  const p = upsertParticipant({
    email: 'escape-test@northwind-university.local',
    consent_at: '2026-01-01T00:00:00Z', consent_source: 'csv_import',
  });
  const t = createTemplate({
    name: 'Escape Test', subject: 'Test subject', sender_name: '<script>alert(1)</script>',
    sender_email: 'x@northwind-university.local', html_body: '<p>Test body text</p>', created_by: null,
  });
  const c = createCampaign({ name: 'Escape Campaign', template_id: t.id, phase: 'pre', created_by: null });
  const token = crypto.randomBytes(16).toString('hex');
  createRecipient({ campaign_id: c.id, participant_id: p.id, token });

  const res = await request(app).get(`/api/v1/t/landing/${token}`);
  assert.equal(res.status, 200);
  assert.ok(!res.text.includes('<script>alert(1)</script>'), 'Raw <script> must not appear in landing page');
  assert.ok(res.text.includes('&lt;script&gt;'), 'Template text must be HTML-escaped');
});
