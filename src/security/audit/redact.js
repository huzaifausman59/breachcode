'use strict';
/**
 * Redaction helpers for audit log detail fields.
 *
 * WHY a dedicated module:
 *   The audit log stores structured JSON in the `detail` column.
 *   We must strip secrets and minimise PII before writing.
 *   Centralising this logic means every audit write goes through
 *   the same scrubber — no call site can accidentally leak data.
 *
 * Rules applied:
 *   - Keys named password*, token*, secret*, hash* → '[Redacted]'
 *   - Email values → '***@domain.tld' (domain kept for debugging)
 *   - Nested objects are recursively scrubbed.
 *   - Arrays are element-wise scrubbed.
 *
 * Satisfies: TH8 (PII leaks in logs), TH12 (secrets in exports).
 */

const SECRET_KEY_PATTERN = /^(password|token|secret|hash|key|credential|auth)/i;

/**
 * Redact a single value based on its key name.
 * @param {string} key
 * @param {*} value
 * @returns {*} redacted value
 */
function redactValue(key, value) {
  if (SECRET_KEY_PATTERN.test(key)) return '[Redacted]';

  if (key === 'email' && typeof value === 'string') {
    // Keep domain for context, hide local part.
    const at = value.indexOf('@');
    return at > -1 ? `***${value.slice(at)}` : '[Redacted]';
  }

  if (typeof value === 'object' && value !== null) {
    return redactObject(value);
  }

  return value;
}

/**
 * Recursively redact an object or array.
 * @param {object|Array} obj
 * @returns {object|Array}
 */
function redactObject(obj) {
  if (Array.isArray(obj)) {
    return obj.map((item) =>
      typeof item === 'object' && item !== null ? redactObject(item) : item,
    );
  }

  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = redactValue(k, v);
  }
  return out;
}

/**
 * Redact a detail object and return a JSON string safe for storage.
 * @param {object} detail
 * @returns {string} JSON string
 */
function redactDetail(detail) {
  if (!detail || typeof detail !== 'object') return JSON.stringify(detail ?? {});
  return JSON.stringify(redactObject(detail));
}

module.exports = { redactDetail, redactObject };
