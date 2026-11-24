'use strict';
/**
 * Audit log repository — READ ONLY.
 *
 * WHY no write function here:
 *   The only write path is appendAudit() in src/security/audit/log.js.
 *   Keeping writes out of this repo makes it impossible to accidentally
 *   add an UPDATE or DELETE path that would break the hash chain (TH7).
 */

const { getDb } = require('./db');

/**
 * List audit events, newest first, with pagination.
 * @param {{ page?, pageSize?, action?, actorId? }} opts
 * @returns {{ rows: object[], total: number }}
 */
function listAuditEvents({ page = 1, pageSize = 50, action, actorId } = {}) {
  const db     = getDb();
  const offset = (page - 1) * pageSize;
  const wheres = [];
  const params = {};

  if (action)  { wheres.push('action = @action');     params.action  = action; }
  if (actorId) { wheres.push('actor_id = @actorId');  params.actorId = actorId; }

  const where = wheres.length ? `WHERE ${wheres.join(' AND ')}` : '';

  const total = db
    .prepare(`SELECT COUNT(*) as n FROM audit_events ${where}`)
    .get(params).n;

  const rows = db
    .prepare(`
      SELECT id, seq, actor_id, actor_role, action, target_type, target_id,
             outcome, detail, request_id, created_at
      FROM audit_events ${where}
      ORDER BY seq DESC
      LIMIT @pageSize OFFSET @offset
    `)
    .all({ ...params, pageSize, offset });

  // Parse detail JSON for each row before returning.
  return {
    rows: rows.map((r) => ({
      ...r,
      detail: (() => { try { return JSON.parse(r.detail); } catch { return {}; } })(),
    })),
    total,
    page,
    pageSize,
  };
}

module.exports = { listAuditEvents };
