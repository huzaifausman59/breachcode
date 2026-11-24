'use strict';
/**
 * Append-only, hash-chained audit log.
 *
 * WHY hash chaining:
 *   An append-only table alone can be bypassed by a DB admin who
 *   directly edits rows. Hash chaining makes tampering detectable:
 *   each row's hash covers the previous row's hash, so editing any
 *   row breaks every subsequent hash. verifyChain() exposes this.
 *
 * HOW the hash is computed:
 *   SHA-256( seq | actor_id | action | target_id | outcome | detail | prev_hash )
 *   Fields joined with '|' — a character unlikely in field values.
 *   The genesis row (seq=1) uses prev_hash = '0'.
 *
 * WHY IP is stored as a hash:
 *   Raw IPs are PII. We hash them so we can still correlate events
 *   from the same source without storing the IP itself (TH8).
 *   A daily salt is prepended so the hash cannot be reversed via
 *   rainbow table against the IPv4 space.
 *
 * Satisfies: TH7 (audit log tampering), TH8 (PII in logs).
 */

const crypto   = require('crypto');
const { v4: uuid } = require('uuid');
const { getDb }    = require('../../repo/db');
const { redactDetail } = require('./redact');
const logger       = require('../../config/logger');

// Salt rotates daily — stored in memory, resets on restart (acceptable).
// WHY: limits IP hash rainbow table attacks to a 24-hour window.
let _daySalt = null;
let _dayKey  = null;

function getDailySalt() {
  const today = new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
  if (_dayKey !== today) {
    _daySalt = crypto.randomBytes(16).toString('hex');
    _dayKey  = today;
  }
  return _daySalt;
}

/**
 * Hash an IP address with a daily rotating salt.
 * @param {string} ip
 * @returns {string} hex SHA-256
 */
function hashIp(ip) {
  if (!ip) return null;
  return crypto
    .createHash('sha256')
    .update(getDailySalt() + ip)
    .digest('hex');
}

/**
 * Compute the row hash covering all integrity-critical fields.
 */
function computeHash(seq, actorId, action, targetId, outcome, detailJson, prevHash) {
  return crypto
    .createHash('sha256')
    .update([seq, actorId ?? '', action, targetId ?? '', outcome, detailJson, prevHash].join('|'))
    .digest('hex');
}

/**
 * Append one event to the audit log.
 * This is the ONLY write path — there is no update or delete.
 *
 * @param {object} opts
 * @param {string}  opts.actorId
 * @param {string}  opts.actorRole
 * @param {string}  opts.action       - from the action catalogue in data-model.md
 * @param {string}  [opts.targetType]
 * @param {string}  [opts.targetId]
 * @param {string}  opts.outcome      - 'success' | 'failure' | 'denied'
 * @param {object}  [opts.detail]     - will be redacted before storage
 * @param {string}  [opts.requestId]
 * @param {string}  [opts.ip]         - raw IP, stored as hash
 */
async function appendAudit(opts) {
  const db = getDb();

  // Synchronous transaction — SQLite is single-writer, this is safe.
  const write = db.transaction(() => {
    // Get the last row's hash and seq for chaining.
    const last = db
      .prepare('SELECT seq, hash FROM audit_events ORDER BY seq DESC LIMIT 1')
      .get();

    const prevHash = last ? last.hash : '0'; // genesis
    const seq      = last ? last.seq + 1 : 1;

    const detailJson = redactDetail(opts.detail || {});
    const hash = computeHash(
      seq,
      opts.actorId ?? null,
      opts.action,
      opts.targetId ?? null,
      opts.outcome,
      detailJson,
      prevHash,
    );

    db.prepare(`
      INSERT INTO audit_events
        (id, seq, actor_id, actor_role, action, target_type, target_id,
         outcome, detail, request_id, ip_hash, prev_hash, hash, created_at)
      VALUES
        (@id, @seq, @actorId, @actorRole, @action, @targetType, @targetId,
         @outcome, @detail, @requestId, @ipHash, @prevHash, @hash, @createdAt)
    `).run({
      id:         uuid(),
      seq,
      actorId:    opts.actorId    ?? null,
      actorRole:  opts.actorRole  ?? null,
      action:     opts.action,
      targetType: opts.targetType ?? null,
      targetId:   opts.targetId   ?? null,
      outcome:    opts.outcome,
      detail:     detailJson,
      requestId:  opts.requestId  ?? null,
      ipHash:     hashIp(opts.ip),
      prevHash,
      hash,
      createdAt:  new Date().toISOString(),
    });
  });

  try {
    write();
  } catch (err) {
    // Audit failures must not crash the main request — log and continue.
    // WHY: a broken audit path should not make the app unavailable.
    // The failure itself is logged at error level for operator attention.
    logger.error({ err, action: opts.action }, 'Audit log write failed');
  }
}

module.exports = { appendAudit, hashIp };
