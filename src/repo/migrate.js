'use strict';
/**
 * Migrations — idempotent DDL run via `npm run setup`.
 * Uses IF NOT EXISTS so re-running is always safe.
 * Tables must be created in FK-dependency order.
 */

// Allow running directly (node src/repo/migrate.js)
// but also importable by tests.
if (require.main === module) {
  // Load .env only when run as a script, not when required by tests
  // (tests set env vars themselves).
  try { require('dotenv').config(); } catch (_) { /* optional dep */ }
}

const { getDb } = require('./db');
const logger    = require('../config/logger');

const MIGRATIONS = [

  // ── Users ──────────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS users (
    id                     TEXT PRIMARY KEY,
    username               TEXT UNIQUE NOT NULL,
    password_hash          TEXT NOT NULL,
    role                   TEXT NOT NULL CHECK(role IN ('admin','operator','viewer')),
    is_active              INTEGER NOT NULL DEFAULT 1,
    failed_login_attempts  INTEGER NOT NULL DEFAULT 0,
    lockout_until          TEXT,
    created_at             TEXT NOT NULL,
    updated_at             TEXT NOT NULL
  )`,

  // ── Sessions (express-session / better-sqlite3-session-store) ──────────
  // The session store creates its own table; we create a placeholder
  // so migrations can be verified cleanly.
  `CREATE TABLE IF NOT EXISTS sessions (
    sid     TEXT PRIMARY KEY,
    sess    TEXT NOT NULL,
    expired TEXT NOT NULL
  )`,

  // ── Templates (FR-1) ───────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS templates (
    id               TEXT PRIMARY KEY,
    name             TEXT NOT NULL,
    subject          TEXT NOT NULL,
    sender_name      TEXT NOT NULL,
    sender_email     TEXT NOT NULL,
    html_body        TEXT NOT NULL,
    text_body        TEXT,
    indicator_result TEXT,
    created_by       TEXT REFERENCES users(id),
    created_at       TEXT NOT NULL,
    updated_at       TEXT NOT NULL
  )`,

  // ── Participants (FR-2) ────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS participants (
    id               TEXT PRIMARY KEY,
    email            TEXT UNIQUE NOT NULL,
    display_name     TEXT,
    consent_at       TEXT NOT NULL,
    consent_source   TEXT NOT NULL CHECK(consent_source IN ('csv_import','manual')),
    consent_status   TEXT NOT NULL DEFAULT 'active' CHECK(consent_status IN ('active','withdrawn')),
    opt_out_at       TEXT,
    created_at       TEXT NOT NULL
  )`,

  // ── Campaigns ──────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS campaigns (
    id               TEXT PRIMARY KEY,
    name             TEXT NOT NULL,
    template_id      TEXT REFERENCES templates(id),
    status           TEXT NOT NULL DEFAULT 'draft'
                       CHECK(status IN ('draft','sending','active','completed','cancelled')),
    phase            TEXT NOT NULL DEFAULT 'pre' CHECK(phase IN ('pre','post')),
    pre_campaign_id  TEXT REFERENCES campaigns(id),
    send_at          TEXT,
    sent_at          TEXT,
    created_by       TEXT REFERENCES users(id),
    created_at       TEXT NOT NULL,
    updated_at       TEXT NOT NULL
  )`,

  // ── Campaign recipients (join: campaign × participant + token) ──────────
  `CREATE TABLE IF NOT EXISTS campaign_recipients (
    id               TEXT PRIMARY KEY,
    campaign_id      TEXT NOT NULL REFERENCES campaigns(id),
    participant_id   TEXT NOT NULL REFERENCES participants(id),
    token            TEXT UNIQUE NOT NULL,
    status           TEXT NOT NULL DEFAULT 'pending'
                       CHECK(status IN ('pending','sent','failed')),
    sent_at          TEXT,
    UNIQUE(campaign_id, participant_id)
  )`,

  // ── Events (FR-4) ──────────────────────────────────────────────────────
  // UNIQUE on (campaign_recipient_id, event_type) prevents duplicate counting (T4, TH10).
  `CREATE TABLE IF NOT EXISTS events (
    id                     TEXT PRIMARY KEY,
    campaign_recipient_id  TEXT NOT NULL REFERENCES campaign_recipients(id),
    event_type             TEXT NOT NULL
                             CHECK(event_type IN ('sent','opened','clicked','submitted','reported','opted_out')),
    occurred_at            TEXT NOT NULL,
    ip_hash                TEXT,
    user_agent_trimmed     TEXT,
    risk_level             TEXT CHECK(risk_level IN ('low','medium','high')),
    UNIQUE(campaign_recipient_id, event_type)
  )`,

  // ── Lessons (FR-5) ────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS lessons (
    id           TEXT PRIMARY KEY,
    template_id  TEXT NOT NULL REFERENCES templates(id),
    title        TEXT NOT NULL,
    content_html TEXT NOT NULL,
    indicators   TEXT,
    created_by   TEXT REFERENCES users(id),
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL
  )`,

  // ── Rules (versioned thresholds for engine) ───────────────────────────
  `CREATE TABLE IF NOT EXISTS rules (
    id              TEXT PRIMARY KEY,
    rule_id         TEXT UNIQUE NOT NULL,
    rule_name       TEXT NOT NULL,
    version         INTEGER NOT NULL DEFAULT 1,
    weight          REAL NOT NULL,
    threshold       REAL NOT NULL,
    is_active       INTEGER NOT NULL DEFAULT 1,
    reason_template TEXT,
    created_by      TEXT REFERENCES users(id),
    updated_at      TEXT NOT NULL
  )`,

  // ── Results (engine outputs) ───────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS results (
    id                 TEXT PRIMARY KEY,
    entity_type        TEXT NOT NULL CHECK(entity_type IN ('template','campaign','analytics')),
    entity_id          TEXT NOT NULL,
    engine_version     TEXT NOT NULL,
    total_score        REAL,
    risk_level         TEXT CHECK(risk_level IN ('low','medium','high')),
    decision           TEXT CHECK(decision IN ('allow','warn','block')),
    rules_applied      TEXT,
    indicators_matched TEXT,
    reasons            TEXT,
    summary            TEXT,
    created_at         TEXT NOT NULL
  )`,

  // ── Audit events (append-only, hash-chained) ───────────────────────────
  // No UPDATE or DELETE endpoint exists for this table (TH7).
  `CREATE TABLE IF NOT EXISTS audit_events (
    id           TEXT PRIMARY KEY,
    seq          INTEGER NOT NULL,
    actor_id     TEXT,
    actor_role   TEXT,
    action       TEXT NOT NULL,
    target_type  TEXT,
    target_id    TEXT,
    outcome      TEXT NOT NULL CHECK(outcome IN ('success','failure','denied')),
    detail       TEXT,
    request_id   TEXT,
    ip_hash      TEXT,
    prev_hash    TEXT NOT NULL,
    hash         TEXT NOT NULL,
    created_at   TEXT NOT NULL
  )`,

  // ── Indexes for common query patterns ─────────────────────────────────
  `CREATE INDEX IF NOT EXISTS idx_campaign_recipients_campaign ON campaign_recipients(campaign_id)`,
  `CREATE INDEX IF NOT EXISTS idx_campaign_recipients_token    ON campaign_recipients(token)`,
  `CREATE INDEX IF NOT EXISTS idx_events_recipient             ON events(campaign_recipient_id)`,
  `CREATE INDEX IF NOT EXISTS idx_audit_seq                    ON audit_events(seq)`,
  `CREATE INDEX IF NOT EXISTS idx_audit_action                 ON audit_events(action)`,
  `CREATE INDEX IF NOT EXISTS idx_participants_email           ON participants(email)`,
];

function migrate() {
  const db = getDb();
  logger.info('Running migrations…');

  const run = db.transaction(() => {
    for (const sql of MIGRATIONS) {
      db.prepare(sql).run();
    }
  });

  run();
  logger.info('Migrations complete');
}

if (require.main === module) {
  migrate();
}

module.exports = { migrate };
