'use strict';
/**
 * Audit log chain verification.
 *
 * verifyChain() walks every row in seq order and recomputes each hash.
 * If any row's stored hash doesn't match the recomputed value, or if
 * the prev_hash doesn't match the previous row's hash, the chain is
 * broken — indicating tampering.
 *
 * Returns a detailed report so the admin can see exactly which row
 * was tampered with.
 *
 * Satisfies: TH7 (audit log tampering detectable).
 */

const crypto   = require('crypto');
const { getDb } = require('../../repo/db');

function computeHash(seq, actorId, action, targetId, outcome, detailJson, prevHash) {
  return crypto
    .createHash('sha256')
    .update([seq, actorId ?? '', action, targetId ?? '', outcome, detailJson, prevHash].join('|'))
    .digest('hex');
}

/**
 * Verify the entire audit log hash chain.
 *
 * @returns {{
 *   ok: boolean,
 *   totalRows: number,
 *   firstTamperedSeq: number|null,
 *   errors: string[]
 * }}
 */
function verifyChain() {
  const db   = getDb();
  const rows = db
    .prepare('SELECT * FROM audit_events ORDER BY seq ASC')
    .all();

  const errors = [];
  let prevHash = '0'; // genesis prev_hash

  for (const row of rows) {
    // Check prev_hash linkage.
    if (row.prev_hash !== prevHash) {
      errors.push(
        `seq=${row.seq}: prev_hash mismatch. Expected ${prevHash}, got ${row.prev_hash}`,
      );
      // Continue checking — report all broken rows, not just the first.
    }

    // Recompute and compare stored hash.
    const expected = computeHash(
      row.seq,
      row.actor_id,
      row.action,
      row.target_id,
      row.outcome,
      row.detail,
      row.prev_hash,
    );

    if (row.hash !== expected) {
      errors.push(
        `seq=${row.seq}: hash mismatch. Row may have been tampered with.`,
      );
    }

    prevHash = row.hash;
  }

  return {
    ok:               errors.length === 0,
    totalRows:        rows.length,
    firstTamperedSeq: errors.length > 0
      ? parseInt(errors[0].match(/seq=(\d+)/)?.[1] ?? '0', 10)
      : null,
    errors,
  };
}

module.exports = { verifyChain };
