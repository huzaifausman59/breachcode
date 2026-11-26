'use strict';
/**
 * Rule: Suspicious TLD or Lookalike Domain
 * rule_id: suspicious_tld
 *
 * Flags two things:
 *   1. Known high-abuse TLDs (.xyz, .top, .click, .tk, etc.)
 *   2. Lookalike domains — substrings of well-known brands
 *      with extra characters (paypa1.com, arnazon.com, mlcrosoft.com)
 *
 * Checks all hrefs in html_body AND the sender_email domain.
 */

const SUSPICIOUS_TLDS = new Set([
  'xyz', 'top', 'click', 'link', 'tk', 'ml', 'ga', 'cf', 'gq',
  'pw', 'work', 'party', 'download', 'review', 'stream', 'gdn',
  'racing', 'win', 'accountant', 'loan', 'date', 'faith', 'trade',
]);

// Well-known brand strings attackers commonly spoof.
const BRAND_PATTERNS = [
  /paypa[^a-z]/i,       // paypal → paypa1
  /arnazon/i,           // amazon → arnazon
  /mlcrosoft/i,         // microsoft → mlcrosoft
  /g00gle/i,            // google → g00gle
  /app1e/i,             // apple → app1e
  /faceb[o0]{2}k/i,     // facebook
  /netfl1x/i,           // netflix
  /[^\w]bank[^\w]/i,    // generic "bank" in domain
];

const ANCHOR_RE = /<a\s[^>]*href=["']([^"']+)["'][^>]*>/gi;

function extractHost(url) {
  try {
    const full = url.startsWith('http') ? url : `https://${url}`;
    return new URL(full).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function extractTld(host) {
  const parts = host.split('.');
  return parts[parts.length - 1];
}

function checkHost(host, found) {
  if (!host) return;

  const tld = extractTld(host);
  if (SUSPICIOUS_TLDS.has(tld)) {
    found.push({ host, reason: `Suspicious TLD: .${tld}` });
  }

  for (const pattern of BRAND_PATTERNS) {
    if (pattern.test(host)) {
      found.push({ host, reason: `Lookalike domain: "${host}" resembles a well-known brand` });
      break;
    }
  }
}

/**
 * @param {object} template
 * @param {object} rule
 * @returns {object} RuleResult
 */
function run(template, rule) {
  const found = [];

  // Check sender email domain.
  const senderMatch = (template.sender_email || '').match(/@([\w.-]+)/);
  if (senderMatch) checkHost(senderMatch[1].toLowerCase(), found);

  // Check all href domains in html_body.
  const html = template.html_body || '';
  ANCHOR_RE.lastIndex = 0;
  let m;
  while ((m = ANCHOR_RE.exec(html)) !== null) {
    const host = extractHost(m[1]);
    if (host) checkHost(host, found);
  }

  // Deduplicate by host+reason string.
  const unique    = [...new Map(found.map((f) => [f.host + f.reason, f])).values()];
  const triggered = unique.length > 0;

  return {
    rule_id:      rule.rule_id,
    rule_name:    rule.rule_name,
    rule_version: rule.version,
    weight:       rule.weight,
    threshold:    rule.threshold,
    score:        triggered ? rule.weight : 0,
    matched:      triggered,
    indicators:   unique.map((f) => f.host),
    reasons:      unique.map((f) => `${f.reason} — potential spoofed or lookalike domain`),
  };
}

module.exports = { run };
