'use strict';
const { v4: uuid } = require('uuid');
const { getDb }    = require('./db');

function now() { return new Date().toISOString(); }

function saveResult({ entity_type, entity_id, engine_version, total_score, risk_level,
  decision, rules_applied, indicators_matched, reasons, summary }) {
  const id = uuid();
  getDb().prepare(`
    INSERT INTO results
      (id, entity_type, entity_id, engine_version, total_score, risk_level,
       decision, rules_applied, indicators_matched, reasons, summary, created_at)
    VALUES
      (@id,@entity_type,@entity_id,@engine_version,@total_score,@risk_level,
       @decision,@rules_applied,@indicators_matched,@reasons,@summary,@ts)
  `).run({
    id, entity_type, entity_id, engine_version, total_score, risk_level,
    decision,
    rules_applied:      JSON.stringify(rules_applied      || []),
    indicators_matched: JSON.stringify(indicators_matched || []),
    reasons:            JSON.stringify(reasons            || []),
    summary:            summary || '',
    ts: now(),
  });
  return findById(id);
}

function findById(id) {
  const row = getDb().prepare('SELECT * FROM results WHERE id=?').get(id);
  return row ? _parse(row) : null;
}

function listResults({ entity_type, entity_id } = {}) {
  const wheres = [];
  const params = {};
  if (entity_type) { wheres.push('entity_type=@entity_type'); params.entity_type = entity_type; }
  if (entity_id)   { wheres.push('entity_id=@entity_id');   params.entity_id   = entity_id; }
  const where = wheres.length ? `WHERE ${wheres.join(' AND ')}` : '';
  return getDb().prepare(`SELECT * FROM results ${where} ORDER BY created_at DESC`)
    .all(params).map(_parse);
}

function _parse(row) {
  return {
    ...row,
    rules_applied:      _j(row.rules_applied),
    indicators_matched: _j(row.indicators_matched),
    reasons:            _j(row.reasons),
  };
}
function _j(s) { try { return JSON.parse(s); } catch { return []; } }

module.exports = { saveResult, findById, listResults };
