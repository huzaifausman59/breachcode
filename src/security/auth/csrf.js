'use strict';
/**
 * CSRF protection — double-submit cookie pattern.
 *
 * WHY not csurf:
 *   csurf is unmaintained (last release 2021) and has an open CVE.
 *   The double-submit cookie pattern is well-understood, requires no
 *   extra dependency, and is recommended by OWASP.
 *
 * HOW it works:
 *   1. On login (or first request), the server sets a __csrf cookie
 *      with a random token. The cookie is SameSite=Strict, NOT HttpOnly
 *      (intentionally — JS must be able to read it to send it back).
 *   2. For every state-changing request (POST/PUT/DELETE/PATCH),
 *      the client reads the cookie and sends the value in the
 *      X-CSRF-Token header.
 *   3. The server compares cookie value === header value using a
 *      timing-safe comparison. If they don't match → 403.
 *
 * WHY this works:
 *   A malicious third-party site can trigger a cross-origin request
 *   but cannot READ the victim's cookies (same-origin policy), so it
 *   cannot copy the token into the header. The check therefore fails
 *   for forged requests.
 *
 * Satisfies: TH4 (CSRF on admin actions).
 */

const crypto = require('crypto');

const CSRF_COOKIE  = '__csrf';
const CSRF_HEADER  = 'x-csrf-token';
const TOKEN_BYTES  = 32; // 256 bits

/**
 * Middleware: ensure a CSRF token cookie exists.
 * Call this on every response so unauthenticated pages also get a token
 * ready for the login form.
 */
function ensureCsrfCookie(req, res, next) {
  if (!req.cookies[CSRF_COOKIE]) {
    const token = crypto.randomBytes(TOKEN_BYTES).toString('hex');
    res.cookie(CSRF_COOKIE, token, {
      httpOnly: false,   // JS must read this — intentional (see above)
      sameSite: 'Strict',
      secure:   process.env.NODE_ENV === 'production',
      path:     '/',
    });
    // Attach to req so the same request can read it immediately.
    req.csrfToken = token;
  } else {
    req.csrfToken = req.cookies[CSRF_COOKIE];
  }
  next();
}

/**
 * Middleware: verify CSRF token for state-changing requests.
 * Skip GET, HEAD, OPTIONS (safe methods per RFC 7231).
 */
function verifyCsrf(req, res, next) {
  const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
  if (SAFE_METHODS.has(req.method)) return next();

  const cookieToken  = req.cookies[CSRF_COOKIE];
  const headerToken  = req.headers[CSRF_HEADER];

  if (!cookieToken || !headerToken) {
    return res.status(403).json({
      error: { code: 'E_FORBIDDEN', message: 'CSRF token missing.' },
    });
  }

  // Timing-safe comparison — prevents timing oracle attacks.
  let valid = false;
  try {
    // Pad to equal length before comparing (timingSafeEqual requires same length).
    const a = Buffer.from(cookieToken,  'utf8');
    const b = Buffer.from(headerToken,  'utf8');
    if (a.length === b.length) {
      valid = crypto.timingSafeEqual(a, b);
    }
  } catch {
    valid = false;
  }

  if (!valid) {
    return res.status(403).json({
      error: { code: 'E_FORBIDDEN', message: 'CSRF token invalid.' },
    });
  }

  next();
}

module.exports = { ensureCsrfCookie, verifyCsrf, CSRF_COOKIE, CSRF_HEADER };
