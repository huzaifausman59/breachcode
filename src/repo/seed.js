'use strict';
/**
 * Seed script — `npm run seed`.
 * Creates demo accounts (documented as DEMO-ONLY in README).
 * Also seeds the default rule set for the security engine.
 *
 * Safe to run multiple times — uses INSERT OR IGNORE.
 *
 * DEMO CREDENTIALS (never use in production):
 *   admin    / Admin@demo1
 *   operator / Operator@demo1
 *   viewer   / Viewer@demo1
 */

try { require('dotenv').config(); } catch (_) {}

const argon2  = require('argon2');
const { v4: uuid } = require('uuid');
const { getDb }    = require('./db');
const { migrate }  = require('./migrate');
const logger       = require('../config/logger');

const NOW = new Date().toISOString();

// Default rules inserted with stable rule_id values.
// Weights and thresholds are admin-tunable via /api/v1/admin/rules.
const DEFAULT_RULES = [
  {
    rule_id: 'urgency_language',
    rule_name: 'Urgency Language Detector',
    weight: 2.0,
    threshold: 5.0,
    reason_template: "Urgency language detected: '{match}' — common phishing pressure tactic",
  },
  {
    rule_id: 'generic_greeting',
    rule_name: 'Generic Greeting Detector',
    weight: 1.0,
    threshold: 5.0,
    reason_template: "Generic greeting detected: '{match}' — legitimate email usually uses recipient name",
  },
  {
    rule_id: 'mismatched_link',
    rule_name: 'Mismatched Link Text vs Href',
    weight: 3.0,
    threshold: 5.0,
    reason_template: "Link text '{text}' does not match destination '{href}' — classic deception tactic",
  },
  {
    rule_id: 'suspicious_tld',
    rule_name: 'Suspicious TLD or Lookalike Domain',
    weight: 2.5,
    threshold: 5.0,
    reason_template: "Suspicious domain/TLD detected: '{match}' — potential spoofed or lookalike domain",
  },
  {
    rule_id: 'sender_mismatch',
    rule_name: 'Display Name / Sender Mismatch',
    weight: 2.0,
    threshold: 5.0,
    reason_template: "Sender display name '{name}' does not match email domain '{domain}'",
  },
  {
    rule_id: 'credential_request',
    rule_name: 'Credential Request Wording',
    weight: 3.0,
    threshold: 5.0,
    reason_template: "Credential-request wording detected: '{match}' — phishing emails often ask to verify or confirm credentials",
  },
];

async function seed() {
  migrate(); // ensure tables exist

  const db = getDb();

  // ── Demo users ─────────────────────────────────────────────────────────
  const users = [
    { username: 'admin',    role: 'admin',    password: 'Admin@demo1' },
    { username: 'operator', role: 'operator', password: 'Operator@demo1' },
    { username: 'viewer',   role: 'viewer',   password: 'Viewer@demo1' },
  ];

  const insertUser = db.prepare(`
    INSERT OR IGNORE INTO users
      (id, username, password_hash, role, is_active, created_at, updated_at)
    VALUES
      (@id, @username, @password_hash, @role, 1, @now, @now)
  `);

  for (const u of users) {
    // argon2id is the recommended variant for password hashing.
    const hash = await argon2.hash(u.password, { type: argon2.argon2id });
    const result = insertUser.run({ id: uuid(), username: u.username, password_hash: hash, role: u.role, now: NOW });
    if (result.changes > 0) {
      logger.info({ username: u.username, role: u.role }, 'Demo user created');
    }
  }

  // ── Default rules ──────────────────────────────────────────────────────
  const insertRule = db.prepare(`
    INSERT OR IGNORE INTO rules
      (id, rule_id, rule_name, version, weight, threshold, is_active, reason_template, updated_at)
    VALUES
      (@id, @rule_id, @rule_name, 1, @weight, @threshold, 1, @reason_template, @now)
  `);

  for (const r of DEFAULT_RULES) {
    const result = insertRule.run({ id: uuid(), ...r, now: NOW });
    if (result.changes > 0) {
      logger.info({ rule_id: r.rule_id }, 'Default rule created');
    }
  }

  logger.info('Seed complete');
}

if (require.main === module) {
  seed().catch((err) => {
    logger.error(err, 'Seed failed');
    process.exit(1);
  });
}

module.exports = { seed };
