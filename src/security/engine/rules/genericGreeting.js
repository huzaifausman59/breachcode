'use strict';
/**
 * Rule: Generic Greeting Detector
 * rule_id: generic_greeting
 *
 * Legitimate emails from organisations that hold your data usually
 * address you by name. Generic greetings like "Dear Customer" or
 * "Dear User" are a strong phishing indicator.
 */

const GENERIC_PATTERNS = [
  /\bdear\s+(customer|user|member|client|account\s+holder|valued\s+(customer|member|user))\b/i,
  /\bhello\s+(customer|user|member|there)\b/i,
  /\bhi\s+(there|customer|user|member)\b/i,
  /\bgreetings\s+(customer|user|member)?\b/i,
  /\bto\s+whom\s+it\s+may\s+concern\b/i,
  /\bdear\s+account\s+owner\b/i,
];

/**
 * @param {object} template
 * @param {object} rule
 * @returns {object} RuleResult
 */
function run(template, rule) {
  const searchText = (template.html_body || '').replace(/<[^>]+>/g, ' ')
    + ' ' + (template.text_body || '');

  const matched = [];
  for (const pattern of GENERIC_PATTERNS) {
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
      (m) => `Generic greeting detected: "${m}" — legitimate email usually uses recipient's name`,
    ),
  };
}

module.exports = { run };
