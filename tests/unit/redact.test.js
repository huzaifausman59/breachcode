'use strict';
/**
 * Redaction unit tests — TH8.
 * Pure function tests — no DB or HTTP needed.
 */

const { test } = require('node:test');
const assert   = require('node:assert/strict');

// Set required env before requiring any src module.
process.env.SESSION_SECRET = 'test-secret-minimum-32-chars-padding-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
process.env.DB_PATH        = './data/test_redact.db';
process.env.NODE_ENV       = 'test';

const { redactDetail, redactObject } = require('../../src/security/audit/redact');

test('password field is redacted', () => {
  const result = redactObject({ password: 'secret123' });
  assert.equal(result.password, '[Redacted]');
});

test('password_hash field is redacted', () => {
  const result = redactObject({ password_hash: '$argon2id$...' });
  assert.equal(result.password_hash, '[Redacted]');
});

test('token field is redacted', () => {
  const result = redactObject({ token: 'abc123token' });
  assert.equal(result.token, '[Redacted]');
});

test('secret field is redacted', () => {
  const result = redactObject({ secret: 'topsecret' });
  assert.equal(result.secret, '[Redacted]');
});

test('email is partially redacted — domain kept', () => {
  const result = redactObject({ email: 'alice@northwind.local' });
  assert.equal(result.email, '***@northwind.local');
});

test('non-sensitive fields are preserved', () => {
  const result = redactObject({ username: 'alice', role: 'operator', count: 42 });
  assert.equal(result.username, 'alice');
  assert.equal(result.role, 'operator');
  assert.equal(result.count, 42);
});

test('nested sensitive fields are redacted', () => {
  const result = redactObject({
    user: { id: 'abc', password: 'hunter2', email: 'x@y.com' },
  });
  assert.equal(result.user.id, 'abc');
  assert.equal(result.user.password, '[Redacted]');
  assert.equal(result.user.email, '***@y.com');
});

test('redactDetail returns valid JSON string', () => {
  const json = redactDetail({ password: 'secret', username: 'bob' });
  const parsed = JSON.parse(json);
  assert.equal(parsed.password, '[Redacted]');
  assert.equal(parsed.username, 'bob');
});

test('redactDetail handles null/undefined gracefully', () => {
  assert.doesNotThrow(() => redactDetail(null));
  assert.doesNotThrow(() => redactDetail(undefined));
  assert.doesNotThrow(() => redactDetail({}));
});

test('arrays inside objects are recursively scrubbed', () => {
  const result = redactObject({
    users: [{ email: 'a@b.com', password: 'x' }, { email: 'c@d.com', token: 'y' }],
  });
  assert.equal(result.users[0].email, '***@b.com');
  assert.equal(result.users[0].password, '[Redacted]');
  assert.equal(result.users[1].token, '[Redacted]');
});
