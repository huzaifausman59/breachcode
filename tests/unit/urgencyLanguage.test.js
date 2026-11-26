'use strict';
const { test } = require('node:test');
const assert   = require('node:assert/strict');
const { run }  = require('../../src/security/engine/rules/urgencyLanguage');

const BASE_RULE = { rule_id: 'urgency_language', rule_name: 'Urgency Language', version: 1, weight: 2.0, threshold: 5.0 };
const BASE_TPL  = { sender_name: 'X', sender_email: 'x@x.local', text_body: '', html_body: '' };

// ── Positive (should fire) ───────────────────────────────────────────────────
test('urgency: "URGENT" in subject fires', () => {
  const r = run({ ...BASE_TPL, subject: 'URGENT: verify now' }, BASE_RULE);
  assert.equal(r.matched, true);
  assert.ok(r.score > 0);
  assert.ok(r.indicators.length > 0);
  assert.ok(r.reasons.length > 0);
});

test('urgency: "account will be suspended" fires', () => {
  const r = run({ ...BASE_TPL, subject: 'x', html_body: '<p>Your account will be suspended</p>' }, BASE_RULE);
  assert.equal(r.matched, true);
});

test('urgency: "action required" fires', () => {
  const r = run({ ...BASE_TPL, subject: 'Action Required' }, BASE_RULE);
  assert.equal(r.matched, true);
});

test('urgency: "within 24 hours" fires', () => {
  const r = run({ ...BASE_TPL, subject: 'x', text_body: 'respond within 24 hours' }, BASE_RULE);
  assert.equal(r.matched, true);
});

// ── Negative (should not fire) ───────────────────────────────────────────────
test('urgency: normal newsletter does not fire', () => {
  const r = run({ ...BASE_TPL, subject: 'Monthly Newsletter', html_body: '<p>Dear Alice, here are updates.</p>' }, BASE_RULE);
  assert.equal(r.matched, false);
  assert.equal(r.score, 0);
});

test('urgency: empty template does not fire', () => {
  const r = run({ ...BASE_TPL, subject: '', html_body: '', text_body: '' }, BASE_RULE);
  assert.equal(r.matched, false);
});

// ── Edge cases ───────────────────────────────────────────────────────────────
test('urgency: result always has required output fields', () => {
  const r = run({ ...BASE_TPL, subject: 'URGENT now' }, BASE_RULE);
  assert.ok('rule_id'      in r);
  assert.ok('rule_name'    in r);
  assert.ok('rule_version' in r);
  assert.ok('weight'       in r);
  assert.ok('threshold'    in r);
  assert.ok('score'        in r);
  assert.ok('matched'      in r);
  assert.ok('indicators'   in r);
  assert.ok('reasons'      in r);
});

test('urgency: score equals weight when matched', () => {
  const r = run({ ...BASE_TPL, subject: 'URGENT act now' }, BASE_RULE);
  assert.equal(r.score, BASE_RULE.weight);
});

test('urgency: score is 0 when not matched', () => {
  const r = run({ ...BASE_TPL, subject: 'Hello', html_body: '<p>Dear Alice</p>' }, BASE_RULE);
  assert.equal(r.score, 0);
});

// ── Misuse ───────────────────────────────────────────────────────────────────
test('urgency: null html_body does not throw', () => {
  assert.doesNotThrow(() => run({ ...BASE_TPL, subject: 'x', html_body: null }, BASE_RULE));
});

test('urgency: undefined fields do not throw', () => {
  assert.doesNotThrow(() => run({ sender_name: 'X', sender_email: 'x@x.local' }, BASE_RULE));
});
