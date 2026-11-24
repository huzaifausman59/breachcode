'use strict';
/**
 * Structured logger using pino.
 * Redaction paths ensure passwords, tokens, and email addresses
 * never appear in log output — satisfying TH8 and T3.
 *
 * WHY redact here rather than at call sites:
 *   Call-site redaction is easy to forget. Declaring the paths once in
 *   the logger configuration guarantees they are always scrubbed,
 *   regardless of which module logs the object.
 */

const pino = require('pino');
const config = require('./index');

const logger = pino({
  level: config.env === 'production' ? 'info' : 'debug',

  // Redact known sensitive paths from any logged object.
  // Values at these paths are replaced with '[Redacted]'.
  redact: {
    paths: [
      'password',
      'password_hash',
      'token',
      'secret',
      'sessionID',
      'req.headers.cookie',
      'req.headers.authorization',
      '*.password',
      '*.password_hash',
      '*.token',
      '*.secret',
      // Email is PII — log domain only via audit layer, not raw in app logs
      '*.email',
      'email',
    ],
    censor: '[Redacted]',
  },

  // In development, pretty-print for readability.
  // In production, emit newline-delimited JSON.
  transport: config.env !== 'production'
    ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard' } }
    : undefined,
});

module.exports = logger;
