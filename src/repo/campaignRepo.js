'use strict';
const { v4: uuid } = require('uuid');
const { getDb }    = require('./db');

function now() { return new Date().toISOString(); }

function listCampaigns() {
  return getDb().prepare(`
    SELECT id, name, template_id, status, phase, pre_campaign_id,
           send_at, sent_at, created_by, created_at, updated_at
    FROM campaigns ORDER BY created_at DESC
  `).all();
}

function findById(id) {
  return getDb().prepare('SELECT * FROM campaigns WHERE id=?').get(id) ?? null;
}

function createCampaign({ name, template_id, phase, pre_campaign_id, created_by }) {
  const id = uuid();
  const ts = now();
  getDb().prepare(`
    INSERT INTO campaigns
      (id, name, template_id, status, phase, pre_campaign_id, created_by, created_at, updated_at)
    VALUES (@id,@name,@template_id,'draft',@phase,@pre_campaign_id,@created_by,@ts,@ts)
  `).run({ id, name, template_id, phase, pre_campaign_id: pre_campaign_id || null, created_by, ts });
  return findById(id);
}

function updateStatus(id, status, extraFields = {}) {
  const ts = now();
  const sets = ['status=@status', 'updated_at=@ts'];
  const params = { id, status, ts };
  if (extraFields.sent_at) { sets.push('sent_at=@sent_at'); params.sent_at = extraFields.sent_at; }
  getDb().prepare(`UPDATE campaigns SET ${sets.join(',')} WHERE id=@id`).run(params);
}

// ── Recipients ───────────────────────────────────────────────────────────────

function createRecipient({ campaign_id, participant_id, token }) {
  const id = uuid();
  getDb().prepare(`
    INSERT OR IGNORE INTO campaign_recipients
      (id, campaign_id, participant_id, token, status)
    VALUES (@id,@campaign_id,@participant_id,@token,'pending')
  `).run({ id, campaign_id, participant_id, token });
  return id;
}

function findRecipientByToken(token) {
  return getDb().prepare(`
    SELECT cr.*, p.email, p.display_name, p.consent_status, p.opt_out_at
    FROM campaign_recipients cr
    JOIN participants p ON p.id = cr.participant_id
    WHERE cr.token=?
  `).get(token) ?? null;
}

function listRecipients(campaign_id) {
  return getDb().prepare(`
    SELECT cr.*, p.email, p.display_name
    FROM campaign_recipients cr
    JOIN participants p ON p.id = cr.participant_id
    WHERE cr.campaign_id=?
  `).all(campaign_id);
}

function markRecipientSent(id) {
  getDb().prepare(`
    UPDATE campaign_recipients SET status='sent', sent_at=? WHERE id=?
  `).run(now(), id);
}

function markRecipientFailed(id) {
  getDb().prepare(`UPDATE campaign_recipients SET status='failed' WHERE id=?`).run(id);
}

module.exports = {
  listCampaigns, findById, createCampaign, updateStatus,
  createRecipient, findRecipientByToken, listRecipients,
  markRecipientSent, markRecipientFailed,
};
