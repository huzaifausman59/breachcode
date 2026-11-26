'use strict';
/**
 * Rule: Mismatched Link Text vs Href
 * rule_id: mismatched_link
 *
 * Parses all <a href="...">text</a> pairs in html_body.
 * A mismatch is flagged when:
 *   - The visible text looks like a URL (contains a dot + TLD)
 *   - AND the actual href domain differs from the text domain
 *
 * Classic example: <a href="http://evil.com">www.paypal.com</a>
 *
 * WHY parse HTML manually here rather than use a DOM library:
 *   The engine must be a pure function with no external I/O.
 *   A regex is sufficient for the structured <a> tag pattern
 *   and keeps the engine dependency-free.
 */

// Matches <a href="...">...</a> — captures href and inner text.
const ANCHOR_RE = /<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

// Looks like a URL in link text: has a dot followed by known TLD chars.
const LOOKS_LIKE_URL_RE = /[\w-]+\.[\w]{2,}/;

/**
 * Extract the hostname from a URL string. Returns null on failure.
 */
function extractHost(url) {
  try {
    // Prepend protocol if missing so URL() can parse it.
    const full = url.startsWith('http') ? url : `https://${url}`;
    return new URL(full).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

/**
 * Strip HTML tags from link inner text to get plain text.
 */
function stripTags(html) {
  return html.replace(/<[^>]+>/g, '').trim();
}

/**
 * @param {object} template
 * @param {object} rule
 * @returns {object} RuleResult
 */
function run(template, rule) {
  const html      = template.html_body || '';
  const mismatches = [];

  let match;
  // Reset lastIndex since ANCHOR_RE is global.
  ANCHOR_RE.lastIndex = 0;

  while ((match = ANCHOR_RE.exec(html)) !== null) {
    const href     = match[1].trim();
    const linkText = stripTags(match[2]);

    // Only flag if the visible text looks like a URL.
    if (!LOOKS_LIKE_URL_RE.test(linkText)) continue;

    const hrefHost = extractHost(href);
    const textHost = extractHost(linkText);

    if (hrefHost && textHost && hrefHost !== textHost) {
      mismatches.push({ text: linkText, href });
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
    indicators:   mismatches.map((m) => `"${m.text}" → ${m.href}`),
    reasons:      mismatches.map(
      (m) => `Link text "${m.text}" does not match destination "${m.href}" — classic deception tactic`,
    ),
  };
}

module.exports = { run };
