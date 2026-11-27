'use strict';
const { v4: uuid } = require('uuid');
const { getDb }    = require('./db');
const crypto       = require('crypto');

function now() { return new Date().toISOString(); }

/**
 * Record an event — idempotent via UNIQUE(campaign_recipient_id, event_type).
 * INSERT OR IGNORE means a second click/open does not create a duplicate row.
 * Satisfies T4 (event accuracy) and TH10 (guessable tokens).
 */
function recordEvent({ campaign_recipient_id, event_type, ip, user_agent, risk_level }) {
  const ipHash = ip
    ? crypto.createHash('sha256').update(ip).digest('hex')
    : null;
  const ua = user_agent ? String(user_agent).slice(0, 200) : null;

  const result = getDb().prepare(`
    INSERT OR IGNORE INTO events
      (id, campaign_recipient_id, event_type, occurred_at, ip_hash, user_agent_trimmed, risk_level)
    VALUES (@id,@crid,@type,@ts,@ipHash,@ua,@risk)
  `).run({ id: uuid(), crid: campaign_recipient_id, type: event_type, ts: now(), ipHash, ua, risk: risk_level || null });

  return result.changes > 0; // false = already recorded (idempotent)
}

function listEventsForCampaign(campaign_id) {
  return getDb().prepare(`
    SELECT e.*, cr.participant_id, cr.token
    FROM events e
    JOIN campaign_recipients cr ON cr.id = e.campaign_recipient_id
    WHERE cr.campaign_id = ?
    ORDER BY e.occurred_at DESC
  `).all(campaign_id);
}

function summariseForCampaign(campaign_id) {
  return getDb().prepare(`
    SELECT
      COUNT(DISTINCT cr.id)                                              AS total_sent,
      COUNT(DISTINCT CASE WHEN e.event_type='opened'    THEN e.id END)  AS opened,
      COUNT(DISTINCT CASE WHEN e.event_type='clicked'   THEN e.id END)  AS clicked,
      COUNT(DISTINCT CASE WHEN e.event_type='submitted' THEN e.id END)  AS submitted,
      COUNT(DISTINCT CASE WHEN e.event_type='reported'  THEN e.id END)  AS reported,
      COUNT(DISTINCT CASE WHEN e.event_type='opted_out' THEN e.id END)  AS opted_out
    FROM campaign_recipients cr
    LEFT JOIN events e ON e.campaign_recipient_id = cr.id
    WHERE cr.campaign_id = ?
  `).get(campaign_id);
}

module.exports = { recordEvent, listEventsForCampaign, summariseForCampaign };
