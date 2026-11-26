'use strict';
const { test } = require('node:test');
const assert   = require('node:assert/strict');
const { run }  = require('../../src/security/engine/rules/mismatchedLink');

const BASE_RULE = { rule_id: 'mismatched_link', rule_name: 'Mismatched Link', version: 1, weight: 3.0, threshold: 5.0 };
const BASE_TPL  = { subject: 'x', sender_name: 'X', sender_email: 'x@x.local', text_body: '' };

test('mismatch: different domains fires', () => {
  const r = run({ ...BASE_TPL, html_body: '<a href="http://evil.com">www.paypal.com</a>' }, BASE_RULE);
  assert.equal(r.matched, true);
  assert.ok(r.indicators.length > 0);
});

test('mismatch: same domain does not fire', () => {
  const r = run({ ...BASE_TPL, html_body: '<a href="http://northwind.local/page">northwind.local</a>' }, BASE_RULE);
  assert.equal(r.matched, false);
});

test('mismatch: link text not a URL does not fire', () => {
  const r = run({ ...BASE_TPL, html_body: '<a href="http://evil.com">Click here</a>' }, BASE_RULE);
  assert.equal(r.matched, false);
});

test('mismatch: no links does not fire', () => {
  const r = run({ ...BASE_TPL, html_body: '<p>No links here</p>' }, BASE_RULE);
  assert.equal(r.matched, false);
});

test('mismatch: multiple mismatched links all reported', () => {
  const html = '<a href="http://evil.com">www.paypal.com</a> and <a href="http://bad.net">www.google.com</a>';
  const r = run({ ...BASE_TPL, html_body: html }, BASE_RULE);
  assert.equal(r.matched, true);
  assert.ok(r.indicators.length >= 2);
});

test('mismatch: null html_body does not throw', () => {
  assert.doesNotThrow(() => run({ ...BASE_TPL, html_body: null }, BASE_RULE));
});

test('mismatch: has all required output fields', () => {
  const r = run({ ...BASE_TPL, html_body: '' }, BASE_RULE);
  assert.ok('rule_id' in r && 'score' in r && 'matched' in r && 'indicators' in r);
});
