'use strict';
const { v4: uuid } = require('uuid');
const { getDb }    = require('./db');

function now() { return new Date().toISOString(); }

function listParticipants() {
  return getDb().prepare(`
    SELECT id, email, display_name, consent_at, consent_source,
           consent_status, opt_out_at, created_at
    FROM participants ORDER BY created_at DESC
  `).all();
}

function findById(id) {
  return getDb().prepare('SELECT * FROM participants WHERE id=?').get(id) ?? null;
}

function findByEmail(email) {
  return getDb().prepare('SELECT * FROM participants WHERE email=?').get(email) ?? null;
}

function upsertParticipant({ email, display_name, consent_at, consent_source }) {
  // Insert new or update consent info if already exists.
  const existing = findByEmail(email);
  if (existing) {
    getDb().prepare(`
      UPDATE participants
      SET display_name=@display_name, consent_at=@consent_at,
          consent_source=@consent_source, consent_status='active', opt_out_at=NULL
      WHERE id=@id
    `).run({ id: existing.id, display_name: display_name || null, consent_at, consent_source });
    return findById(existing.id);
  }
  const id = uuid();
  getDb().prepare(`
    INSERT INTO participants
      (id, email, display_name, consent_at, consent_source, consent_status, created_at)
    VALUES (@id,@email,@display_name,@consent_at,@consent_source,'active',@ts)
  `).run({ id, email, display_name: display_name || null, consent_at, consent_source, ts: now() });
  return findById(id);
}

function optOut(id) {
  getDb().prepare(`
    UPDATE participants
    SET consent_status='withdrawn', opt_out_at=@ts
    WHERE id=@id AND opt_out_at IS NULL
  `).run({ id, ts: now() });
}

function optOutByToken(token) {
  // Resolve participant via campaign_recipient token.
  const row = getDb().prepare(`
    SELECT p.id FROM participants p
    JOIN campaign_recipients cr ON cr.participant_id = p.id
    WHERE cr.token=?
  `).get(token);
  if (row) optOut(row.id);
  return row ?? null;
}

function deleteParticipant(id) {
  getDb().prepare('DELETE FROM participants WHERE id=?').run(id);
}

module.exports = { listParticipants, findById, findByEmail, upsertParticipant, optOut, optOutByToken, deleteParticipant };
