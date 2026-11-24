'use strict';
/**
 * Login rate limiting and account lockout.
 *
 * TWO layers of protection (defence in depth):
 *
 * Layer 1 — IP-based rate limiting via express-rate-limit.
 *   Limits the number of POST /auth/login requests from a single IP
 *   within a time window. Stops distributed spray attacks.
 *
 * Layer 2 — Per-account lockout stored in the DB.
 *   After N failed attempts for a specific username, that account is
 *   locked for M minutes regardless of which IP is trying.
 *   Stops targeted attacks that rotate IPs.
 *
 * WHY both:
 *   IP limiting alone fails when attackers use botnets.
 *   Account lockout alone can be used to DoS legitimate users.
 *   Together they raise the cost of both attack types.
 *
 * Satisfies: TH9 (brute-force login).
 */

const rateLimit = require('express-rate-limit');
const config    = require('../../config');

/**
 * IP-based rate limiter for the login endpoint.
 * Returns 429 with E_RATE_LIMIT after too many requests.
 */
const loginRateLimiter = rateLimit({
  windowMs:         config.rateLimit.loginWindowMinutes * 60 * 1000,
  max:              config.rateLimit.loginMaxAttempts * 3, // generous IP limit; account lockout is stricter
  standardHeaders:  true,
  legacyHeaders:    false,
  keyGenerator:     (req) => req.ip,
  handler: (_req, res) => {
    res.status(429).json({
      error: {
        code:        'E_RATE_LIMIT',
        message:     'Too many login attempts. Please try again later.',
        retry_after: config.rateLimit.loginWindowMinutes * 60,
      },
    });
  },
});

/**
 * General API rate limiter — applied to all /api/v1 routes.
 */
const apiRateLimiter = rateLimit({
  windowMs:        config.rateLimit.apiWindowMinutes * 60 * 1000,
  max:             config.rateLimit.apiMax,
  standardHeaders: true,
  legacyHeaders:   false,
  handler: (_req, res) => {
    res.status(429).json({
      error: {
        code:        'E_RATE_LIMIT',
        message:     'Too many requests. Please slow down.',
        retry_after: config.rateLimit.apiWindowMinutes * 60,
      },
    });
  },
});

/**
 * Check whether an account is currently locked out.
 * @param {object} user - user row from DB
 * @returns {boolean}
 */
function isLockedOut(user) {
  if (!user.lockout_until) return false;
  return new Date(user.lockout_until) > new Date();
}

/**
 * Returns seconds remaining on lockout (0 if not locked).
 * @param {object} user
 * @returns {number}
 */
function lockoutSecondsRemaining(user) {
  if (!isLockedOut(user)) return 0;
  return Math.ceil((new Date(user.lockout_until) - new Date()) / 1000);
}

module.exports = { loginRateLimiter, apiRateLimiter, isLockedOut, lockoutSecondsRemaining };
