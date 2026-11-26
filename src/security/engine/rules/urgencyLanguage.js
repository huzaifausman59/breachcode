'use strict';
/**
 * Rule: Urgency Language Detector
 * rule_id: urgency_language
 *
 * Detects pressure-tactic language commonly used in phishing emails.
 * Examples: "Act now", "Account suspended", "Verify immediately".
 *
 * WHY this matters:
 *   Urgency is the #1 social engineering technique in phishing.
 *   Legitimate organisations rarely threaten immediate account closure
 *   or demand action within hours.
 *
 * Returns every matched phrase so the micro-lesson can name them
 * specifically — never just "unsafe" (spec requirement).
 */

const URGENCY_PATTERNS = [
  /\bact\s+now\b/i,
  /\burgent(ly)?\b/i,
  /\bimmediately\b/i,
  /\bwithin\s+\d+\s+(hour|minute|day)s?\b/i,
  /\baccount\s+(will\s+be\s+)?(suspended|closed|terminated|deactivated|locked)\b/i,
  /\bverify\s+(your\s+)?(account|identity|information|details)\s+(now|immediately|urgently)\b/i,
  /\blast\s+chance\b/i,
  /\bexpires?\s+(today|soon|in\s+\d+)\b/i,
  /\bfailure\s+to\s+(act|respond|verify)\b/i,
  /\baction\s+required\b/i,
  /\bimmediate\s+(action|attention|response)\b/i,
  /\bdo\s+not\s+ignore\b/i,
  /\byour\s+account\s+(has\s+been|is)\s+(compromised|hacked|breached)\b/i,
];

/**
 * @param {object} template
 * @param {string} template.subject
 * @param {string} template.html_body
 * @param {string} [template.text_body]
 * @param {object} rule  - row from rules table { rule_id, rule_name, version, weight, threshold }
 * @returns {object} RuleResult
 */
function run(template, rule) {
  const searchText = [
    template.subject   || '',
    template.text_body || '',
    // Strip HTML tags for plain-text matching on html_body.
    (template.html_body || '').replace(/<[^>]+>/g, ' '),
  ].join(' ');

  const matched = [];
  for (const pattern of URGENCY_PATTERNS) {
    const m = searchText.match(pattern);
    if (m) matched.push(m[0].trim());
  }

  // Deduplicate matches.
  const unique = [...new Set(matched)];
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
      (m) => `Urgency language detected: "${m}" — common phishing pressure tactic`,
    ),
  };
}

module.exports = { run };
