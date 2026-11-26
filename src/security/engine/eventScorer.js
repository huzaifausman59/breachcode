'use strict';
/**
 * Event Scorer — assigns risk level and recommended action
 * to each participant event type.
 *
 * Event hierarchy (worst to best):
 *   submitted > clicked > opened > sent > reported (reported = good)
 *
 * Satisfies FR-4 (event tracking with risk level).
 */

const EVENT_RISK = {
  submitted: { riskLevel: 'high',   action: 'Immediate retraining required. Participant submitted credentials on phishing page.' },
  clicked:   { riskLevel: 'high',   action: 'Retraining recommended. Participant clicked phishing link.' },
  opened:    { riskLevel: 'medium', action: 'Awareness reminder suggested. Participant opened phishing email.' },
  sent:      { riskLevel: 'low',    action: 'No action needed. Email delivered.' },
  reported:  { riskLevel: 'low',    action: 'Positive behaviour. Participant correctly identified and reported phishing.' },
  opted_out: { riskLevel: 'low',    action: 'Participant opted out. Exclude from future sends.' },
};

/**
 * Score a single event.
 * @param {string} eventType - 'sent'|'opened'|'clicked'|'submitted'|'reported'|'opted_out'
 * @returns {{ riskLevel: string, action: string, score: number }}
 */
function scoreEvent(eventType) {
  const result = EVENT_RISK[eventType];
  if (!result) {
    return { riskLevel: 'low', action: 'Unknown event type.', score: 0 };
  }

  // Numeric score for sorting/comparison.
  const scoreMap = { high: 3, medium: 2, low: 1 };
  return { ...result, score: scoreMap[result.riskLevel] || 0 };
}

/**
 * Given a list of events for one recipient, return their worst outcome.
 * @param {string[]} eventTypes
 * @returns {{ worstEvent: string, riskLevel: string, action: string }}
 */
function worstOutcome(eventTypes) {
  if (!eventTypes || eventTypes.length === 0) {
    return { worstEvent: 'none', riskLevel: 'low', action: 'No events recorded.' };
  }

  let worst = { worstEvent: eventTypes[0], ...scoreEvent(eventTypes[0]) };
  for (const ev of eventTypes) {
    const s = scoreEvent(ev);
    if (s.score > worst.score) {
      worst = { worstEvent: ev, ...s };
    }
  }
  return worst;
}

module.exports = { scoreEvent, worstOutcome };
