'use strict';
/**
 * Rule: Display Name / Sender Mismatch
 * rule_id: sender_mismatch
 *
 * Checks whether the sender_name implies an organisation that
 * does not match the sender_email domain.
 *
 * Example: sender_name="PayPal Support", sender_email="support@evil123.xyz"
 *
 * WHY this matters:
 *   Email clients show the display name prominently. Attackers set
 *   it to a trusted brand while using their own domain in the address.
 *   Most users never look at the actual email address.
 */

// Map of brand keywords to their expected domain substrings.
// If sender_name contains the brand keyword but the email domain
// does NOT contain the expected domain, it is a mismatch.
const BRAND_DOMAIN_MAP = [
  { keywords: [/paypal/i],              expectedDomains: ['paypal.com'] },
  { keywords: [/amazon/i],              expectedDomains: ['amazon.com', 'amazon.co'] },
  { keywords: [/microsoft/i, /outlook/i, /hotmail/i], expectedDomains: ['microsoft.com', 'outlook.com', 'hotmail.com'] },
  { keywords: [/google/i, /gmail/i],    expectedDomains: ['google.com', 'gmail.com'] },
  { keywords: [/apple/i],               expectedDomains: ['apple.com', 'icloud.com'] },
  { keywords: [/facebook/i, /meta/i],   expectedDomains: ['facebook.com', 'meta.com'] },
  { keywords: [/netflix/i],             expectedDomains: ['netflix.com'] },
  { keywords: [/bank/i],                expectedDomains: ['bank'] }, // generic — any "bank" in domain
  { keywords: [/northwind/i],           expectedDomains: ['northwind'] },
];

/**
 * @param {object} template
 * @param {object} rule
 * @returns {object} RuleResult
 */
function run(template, rule) {
  const senderName  = (template.sender_name  || '').toLowerCase();
  const senderEmail = (template.sender_email || '').toLowerCase();

  // Extract domain from sender email.
  const domainMatch = senderEmail.match(/@([\w.-]+)/);
  const domain      = domainMatch ? domainMatch[1] : '';

  const mismatches = [];

  for (const { keywords, expectedDomains } of BRAND_DOMAIN_MAP) {
    const nameMatchesKeyword = keywords.some((kw) => kw.test(senderName));
    if (!nameMatchesKeyword) continue;

    const domainMatchesExpected = expectedDomains.some((ed) => domain.includes(ed));
    if (!domainMatchesExpected) {
      mismatches.push({
        name:   template.sender_name,
        domain,
        reason: `Sender name "${template.sender_name}" implies a known brand but email domain is "${domain}"`,
      });
    }
  }

  const triggered = mismatches.length > 0;

  return {
    rule_id:      rule.rule_id,
    rule_name:    rule.rule_name,
    rule_version: rule.version,
    weight:       rule.weight,
    threshold:    rule.threshold,
    score:        triggered ? rule.weight : 0,
    matched:      triggered,
    indicators:   mismatches.map((m) => `"${m.name}" → ${m.domain}`),
    reasons:      mismatches.map((m) => `${m.reason} — display name spoofing`),
  };
}

module.exports = { run };
