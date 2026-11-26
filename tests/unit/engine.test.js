'use strict';
const { test } = require('node:test');
const assert   = require('node:assert/strict');

const { run: runSenderMismatch }    = require('../../src/security/engine/rules/senderMismatch');
const { run: runSuspiciousTld }     = require('../../src/security/engine/rules/suspiciousTld');
const { run: runCredential }        = require('../../src/security/engine/rules/credentialRequest');
const { run: runGeneric }           = require('../../src/security/engine/rules/genericGreeting');
const { checkConsent, filterConsented } = require('../../src/security/engine/consentPolicy');
const { scoreEvent, worstOutcome }  = require('../../src/security/engine/eventScorer');
const { compare, rate }             = require('../../src/security/engine/prePostComparison');
const { analyzeTemplate }           = require('../../src/security/engine/engine');

const BASE_RULE = (rule_id) => ({
  rule_id, rule_name: rule_id, version: 1, weight: 2.0, threshold: 5.0, is_active: 1,
});

// ── Sender mismatch ──────────────────────────────────────────────────────────
test('senderMismatch: PayPal name + evil domain fires', () => {
  const r = runSenderMismatch(
    { subject: 'x', sender_name: 'PayPal Support', sender_email: 'noreply@evil.xyz', html_body: '' },
    BASE_RULE('sender_mismatch'),
  );
  assert.equal(r.matched, true);
});

test('senderMismatch: Northwind name + northwind domain does not fire', () => {
  const r = runSenderMismatch(
    { subject: 'x', sender_name: 'Northwind University', sender_email: 'noreply@northwind-university.local', html_body: '' },
    BASE_RULE('sender_mismatch'),
  );
  assert.equal(r.matched, false);
});

test('senderMismatch: unknown brand does not fire', () => {
  const r = runSenderMismatch(
    { subject: 'x', sender_name: 'Some Random Co', sender_email: 'info@somerandom.com', html_body: '' },
    BASE_RULE('sender_mismatch'),
  );
  assert.equal(r.matched, false);
});

// ── Suspicious TLD ───────────────────────────────────────────────────────────
test('suspiciousTld: .xyz sender domain fires', () => {
  const r = runSuspiciousTld(
    { subject: 'x', sender_name: 'X', sender_email: 'x@evil.xyz', html_body: '' },
    BASE_RULE('suspicious_tld'),
  );
  assert.equal(r.matched, true);
});

test('suspiciousTld: .local sender domain does not fire', () => {
  const r = runSuspiciousTld(
    { subject: 'x', sender_name: 'X', sender_email: 'x@northwind.local', html_body: '' },
    BASE_RULE('suspicious_tld'),
  );
  assert.equal(r.matched, false);
});

test('suspiciousTld: lookalike paypa1 domain fires', () => {
  const r = runSuspiciousTld(
    { subject: 'x', sender_name: 'X', sender_email: 'x@paypa1.com', html_body: '' },
    BASE_RULE('suspicious_tld'),
  );
  assert.equal(r.matched, true);
});

// ── Credential request ───────────────────────────────────────────────────────
test('credentialRequest: "enter your password" fires', () => {
  const r = runCredential(
    { subject: 'x', html_body: '<p>Please enter your password to continue</p>', text_body: '' },
    BASE_RULE('credential_request'),
  );
  assert.equal(r.matched, true);
});

test('credentialRequest: "click to verify your account" fires', () => {
  const r = runCredential(
    { subject: 'x', html_body: '<p>Click here to verify your account</p>', text_body: '' },
    BASE_RULE('credential_request'),
  );
  assert.equal(r.matched, true);
});

test('credentialRequest: normal call-to-action does not fire', () => {
  const r = runCredential(
    { subject: 'x', html_body: '<p>Click here to read more about our services</p>', text_body: '' },
    BASE_RULE('credential_request'),
  );
  assert.equal(r.matched, false);
});

// ── Generic greeting ─────────────────────────────────────────────────────────
test('genericGreeting: "Dear Customer" fires', () => {
  const r = runGeneric(
    { subject: 'x', html_body: '<p>Dear Customer,</p>', text_body: '' },
    BASE_RULE('generic_greeting'),
  );
  assert.equal(r.matched, true);
});

test('genericGreeting: "Dear Alice" does not fire', () => {
  const r = runGeneric(
    { subject: 'x', html_body: '<p>Dear Alice,</p>', text_body: '' },
    BASE_RULE('generic_greeting'),
  );
  assert.equal(r.matched, false);
});

// ── Consent policy ───────────────────────────────────────────────────────────
test('consent: active participant is permitted', () => {
  const result = checkConsent({ consent_at: '2026-01-01T00:00:00Z', consent_status: 'active', consent_source: 'csv_import', opt_out_at: null });
  assert.equal(result.permitted, true);
});

test('consent: opted-out participant is blocked', () => {
  const result = checkConsent({ consent_at: '2026-01-01T00:00:00Z', consent_status: 'active', consent_source: 'csv_import', opt_out_at: '2026-06-01T00:00:00Z' });
  assert.equal(result.permitted, false);
  assert.ok(result.reason.includes('opted out'));
});

test('consent: withdrawn consent is blocked', () => {
  const result = checkConsent({ consent_at: '2026-01-01T00:00:00Z', consent_status: 'withdrawn', consent_source: 'csv_import', opt_out_at: null });
  assert.equal(result.permitted, false);
});

test('consent: missing consent_at is blocked', () => {
  const result = checkConsent({ consent_at: null, consent_status: 'active', consent_source: 'csv_import', opt_out_at: null });
  assert.equal(result.permitted, false);
});

test('consent: null participant is blocked', () => {
  const result = checkConsent(null);
  assert.equal(result.permitted, false);
});

test('filterConsented: splits permitted and blocked correctly', () => {
  const participants = [
    { id: '1', consent_at: '2026-01-01T00:00:00Z', consent_status: 'active', consent_source: 'csv_import', opt_out_at: null },
    { id: '2', consent_at: '2026-01-01T00:00:00Z', consent_status: 'active', consent_source: 'csv_import', opt_out_at: '2026-06-01T00:00:00Z' },
    { id: '3', consent_at: null, consent_status: 'active', consent_source: 'csv_import', opt_out_at: null },
  ];
  const { permitted, blocked } = filterConsented(participants);
  assert.equal(permitted.length, 1);
  assert.equal(blocked.length, 2);
});

// ── Event scorer ─────────────────────────────────────────────────────────────
test('eventScorer: submitted = high risk', () => {
  assert.equal(scoreEvent('submitted').riskLevel, 'high');
});

test('eventScorer: reported = low risk', () => {
  assert.equal(scoreEvent('reported').riskLevel, 'low');
});

test('eventScorer: worstOutcome picks submitted over opened', () => {
  const result = worstOutcome(['opened', 'submitted', 'sent']);
  assert.equal(result.worstEvent, 'submitted');
  assert.equal(result.riskLevel, 'high');
});

test('eventScorer: worstOutcome handles empty array', () => {
  const result = worstOutcome([]);
  assert.equal(result.worstEvent, 'none');
});

// ── Pre/post comparison ───────────────────────────────────────────────────────
test('prePost: lower click rate post-training = improved', () => {
  const result = compare(
    { total_sent: 20, clicked: 10, submitted: 5, reported: 1 },
    { total_sent: 20, clicked: 3,  submitted: 1, reported: 5 },
  );
  assert.equal(result.improved, true);
  assert.ok(result.improvementScore > 0);
});

test('prePost: higher click rate post-training = not improved', () => {
  const result = compare(
    { total_sent: 20, clicked: 2, submitted: 1, reported: 5 },
    { total_sent: 20, clicked: 10, submitted: 5, reported: 1 },
  );
  assert.equal(result.improved, false);
});

test('prePost: small sample triggers warning', () => {
  const result = compare(
    { total_sent: 5, clicked: 2, submitted: 1, reported: 0 },
    { total_sent: 5, clicked: 1, submitted: 0, reported: 1 },
  );
  assert.ok(result.warnings.length > 0);
  assert.ok(result.sample_size_note.includes('Low sample'));
});

test('prePost: rate() handles zero total', () => {
  assert.equal(rate(5, 0), 0);
});

// ── Full engine integration ───────────────────────────────────────────────────
test('engine: adverse template scores block with all 6 rules', () => {
  const template = require('../../fixtures/templates/adverse_template.json');
  const result   = analyzeTemplate(template);
  assert.equal(result.decision,   'block');
  assert.equal(result.risk_level, 'high');
  assert.ok(result.total_score > 0);
  assert.ok(result.indicators_matched.length > 0);
  assert.ok(result.reasons.length > 0);
  assert.ok(result.summary.includes('indicator'));
});

test('engine: normal template scores allow', () => {
  const template = require('../../fixtures/templates/normal_template.json');
  const result   = analyzeTemplate(template);
  assert.equal(result.decision,   'allow');
  assert.equal(result.risk_level, 'low');
});

test('engine: result always has required reproducibility fields', () => {
  const result = analyzeTemplate({ subject: 'x', sender_name: 'X', sender_email: 'x@x.local', html_body: '', text_body: '' });
  assert.ok(result.engine_version);
  assert.ok(result.evaluated_at);
  assert.ok(Array.isArray(result.rules_applied));
  assert.ok(typeof result.total_score === 'number');
  // Every rule result must have reproducibility fields.
  for (const r of result.rules_applied) {
    assert.ok(r.rule_id,      'rule_id missing');
    assert.ok(r.rule_name,    'rule_name missing');
    assert.ok(r.rule_version, 'rule_version missing');
    assert.ok('weight'    in r, 'weight missing');
    assert.ok('threshold' in r, 'threshold missing');
  }
});

test('engine: empty template does not throw', () => {
  assert.doesNotThrow(() =>
    analyzeTemplate({ subject: '', sender_name: '', sender_email: '', html_body: '', text_body: '' }),
  );
});

test('engine: specific indicators named — never just "unsafe"', () => {
  const template = require('../../fixtures/templates/adverse_template.json');
  const result   = analyzeTemplate(template);
  // Every reason must name a specific indicator, not a generic message.
  for (const reason of result.reasons) {
    assert.ok(reason.length > 10, 'Reason must be descriptive');
    assert.ok(!reason.toLowerCase().includes('unsafe'), 'Must not say "unsafe" without detail');
  }
});
