'use strict';
/**
 * Consent and Opt-Out Policy Engine
 *
 * Pure function — no DB access. Receives participant data and
 * returns whether sending is permitted, with a reason.
 *
 * Rules (in priority order):
 *   1. opted_out → never send (permanent)
 *   2. consent_status !== 'active' → never send
 *   3. No consent_at timestamp → never send
 *   4. Otherwise → permitted
 *
 * Satisfies: FR-2 (consent), T2 (opt-out flow), TH11 (emails to non-consented).
 */

/**
 * @param {object} participant - row from participants table
 * @returns {{ permitted: boolean, reason: string }}
 */
function checkConsent(participant) {
  if (!participant) {
    return { permitted: false, reason: 'Participant record not found.' };
  }

  if (participant.opt_out_at) {
    return {
      permitted: false,
      reason:    `Participant opted out on ${participant.opt_out_at}. Sending is permanently blocked.`,
    };
  }

  if (participant.consent_status !== 'active') {
    return {
      permitted: false,
      reason:    `Participant consent status is "${participant.consent_status}". Only "active" consent permits sending.`,
    };
  }

  if (!participant.consent_at) {
    return {
      permitted: false,
      reason:    'No consent timestamp recorded. Participant must have explicit consent before receiving simulated phishing emails.',
    };
  }

  return {
    permitted: true,
    reason:    `Consent active since ${participant.consent_at} (source: ${participant.consent_source}).`,
  };
}

/**
 * Filter a list of participants to only those permitted to receive mail.
 * Returns { permitted: [], blocked: [] } with reasons.
 *
 * @param {object[]} participants
 * @returns {{ permitted: object[], blocked: object[] }}
 */
function filterConsented(participants) {
  const permitted = [];
  const blocked   = [];

  for (const p of participants) {
    const result = checkConsent(p);
    if (result.permitted) {
      permitted.push({ participant: p, reason: result.reason });
    } else {
      blocked.push({ participant: p, reason: result.reason });
    }
  }

  return { permitted, blocked };
}

module.exports = { checkConsent, filterConsented };
