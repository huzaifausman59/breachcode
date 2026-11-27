'use strict';
const { getDb } = require('./db');

function now() { return new Date().toISOString(); }

function listRules() {
  return getDb().prepare('SELECT * FROM rules ORDER BY rule_id').all();
}

function findById(id) {
  return getDb().prepare('SELECT * FROM rules WHERE id=?').get(id) ?? null;
}

function listActiveRules() {
  return getDb().prepare('SELECT * FROM rules WHERE is_active=1').all();
}

/**
 * Update a rule threshold/weight — increments version for reproducibility.
 * Every change is audited by the caller (admin route).
 */
function updateRule(id, { weight, threshold, is_active, updated_by }) {
  const existing = findById(id);
  if (!existing) return null;

  getDb().prepare(`
    UPDATE rules
    SET weight=@weight, threshold=@threshold, is_active=@is_active,
        version=@version, updated_at=@ts
    WHERE id=@id
  `).run({
    id,
    weight:    weight    ?? existing.weight,
    threshold: threshold ?? existing.threshold,
    is_active: is_active !== undefined ? (is_active ? 1 : 0) : existing.is_active,
    version:   existing.version + 1,
    ts:        now(),
  });

  return findById(id);
}

module.exports = { listRules, findById, listActiveRules, updateRule };
