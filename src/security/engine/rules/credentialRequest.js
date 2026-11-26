'use strict';
/**
 * Rule: Credential Request Wording
 * rule_id: credential_request
 *
 * Detects language that asks the recipient to provide, verify,
 * confirm, or enter their credentials or personal information.
 *
 * WHY this matters:
 *   Legitimate services never ask you to confirm your password
 *   or full credentials via email. Any email that does is almost
 *   certainly a phishing attempt.
 */

const CREDENTIAL_PATTERNS = [
  /\b(enter|provide|confirm|verify|update|submit|re-?enter)\s+(your\s+)?(password|credentials|login|username|pin|card\s+number|account\s+details|personal\s+information|banking\s+details)\b/i,
  /\bclick\s+(here\s+)?to\s+(verify|confirm|validate|update)\s+(your\s+)?(account|identity|details|information)\b/i,
  /\b(sign\s+in|log\s+in|login)\s+to\s+(verify|confirm|secure|protect)\b/i,
  /\byour\s+(password|credentials?|login\s+details?)\s+(has|have)?\s*(expired|needs?\s+update|must\s+be\s+(changed|updated|verified))\b/i,
  /\bvalidate\s+your\s+(account|identity|information)\b/i,
  /\breactivate\s+your\s+account\b/i,
  /\bunlock\s+your\s+account\b/i,
];

/**
 * @param {object} template
 * @param {object} rule
 * @returns {object} RuleResult
 */
function run(template, rule) {
  const searchText = [
    template.subject   || '',
    template.text_body || '',
    (template.html_body || '').replace(/<[^>]+>/g, ' '),
  ].join(' ');

  const matched = [];
  for (const pattern of CREDENTIAL_PATTERNS) {
    const m = searchText.match(pattern);
    if (m) matched.push(m[0].trim());
  }

  const unique    = [...new Set(matched)];
  const triggered = unique.length > 0;

  return {
    rule_id:      rule.rule_id,
    rule_name:    rule.rule_name,
    rule_version: rule.version,
    weight:       rule.weight,
    threshold:    rule.threshold,
    score:        triggered ? rule.weight : 0,
    matched:      triggered,
    indicators:   unique,
    reasons:      unique.map(
      (m) => `Credential-request wording: "${m}" — legitimate services never ask for passwords via email`,
    ),
  };
}

module.exports = { run };
