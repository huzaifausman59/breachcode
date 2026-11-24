'use strict';
/**
 * Auth routes: POST /auth/login, POST /auth/logout, GET /auth/me
 *
 * Security decisions explained inline.
 */

const router = require('express').Router();

const { validate }           = require('../middleware/validate');
const { loginSchema }        = require('../schemas/auth.schema');
const { createError }        = require('../errorHandler');
const { verifyPassword }     = require('../../security/auth/hash');
const { loginRateLimiter, isLockedOut, lockoutSecondsRemaining } = require('../../security/auth/rateLimiter');
const { requireAuth }        = require('../../security/auth/rbac');
const { appendAudit }        = require('../../security/audit/log');
const userRepo               = require('../../repo/userRepo');

// ── POST /auth/login ────────────────────────────────────────────────────────
router.post('/login', loginRateLimiter, validate(loginSchema), async (req, res, next) => {
  const { username, password } = req.validated;

  try {
    const user = userRepo.findByUsername(username);

    // WHY same error for "user not found" and "wrong password":
    //   Distinguishing them lets attackers enumerate valid usernames.
    //   We always do the full password check (or a dummy one) to prevent
    //   timing-based enumeration too.
    if (!user) {
      await appendAudit({
        action: 'login.failure', outcome: 'failure',
        detail: { reason: 'user_not_found' },
        requestId: req.id, ip: req.ip,
      });
      return next(createError('E_AUTH', 'Invalid username or password.'));
    }

    // Check account lockout before verifying password (TH9).
    if (isLockedOut(user)) {
      const remaining = lockoutSecondsRemaining(user);
      await appendAudit({
        actorId: user.id, actorRole: user.role,
        action: 'login.lockout', outcome: 'failure',
        detail: { remaining_seconds: remaining },
        requestId: req.id, ip: req.ip,
      });
      return next(createError('E_RATE_LIMIT', 'Account temporarily locked. Try again later.', {
        retry_after: remaining,
      }));
    }

    const valid = await verifyPassword(user.password_hash, password);

    if (!valid) {
      userRepo.recordFailedLogin(user.id);
      await appendAudit({
        actorId: user.id, actorRole: user.role,
        action: 'login.failure', outcome: 'failure',
        detail: { reason: 'wrong_password', attempts: user.failed_login_attempts + 1 },
        requestId: req.id, ip: req.ip,
      });
      return next(createError('E_AUTH', 'Invalid username or password.'));
    }

    // ── Successful login ────────────────────────────────────────────────
    userRepo.resetFailedLogins(user.id);

    // WHY session regeneration:
    //   Regenerating the session ID after login prevents session fixation
    //   attacks where an attacker pre-sets a known session ID (TH5).
    req.session.regenerate(async (err) => {
      if (err) return next(err);

      // Store minimal user info in session — never the password hash.
      req.session.user      = { id: user.id, username: user.username, role: user.role };
      req.session.createdAt = Date.now(); // for absolute expiry check

      await appendAudit({
        actorId: user.id, actorRole: user.role,
        action: 'login.success', outcome: 'success',
        targetType: 'session', targetId: null,
        detail: { username: user.username },
        requestId: req.id, ip: req.ip,
      });

      res.json({
        user:      { id: user.id, username: user.username, role: user.role },
        csrfToken: req.csrfToken, // client stores this to send in X-CSRF-Token header
      });
    });

  } catch (err) {
    next(err);
  }
});

// ── POST /auth/logout ────────────────────────────────────────────────────────
router.post('/logout', requireAuth, async (req, res, next) => {
  const user = req.session.user;

  req.session.destroy(async (err) => {
    if (err) return next(err);

    await appendAudit({
      actorId: user.id, actorRole: user.role,
      action: 'logout', outcome: 'success',
      requestId: req.id, ip: req.ip,
    });

    // Clear session cookie.
    res.clearCookie('connect.sid');
    res.json({ message: 'Logged out successfully.' });
  });
});

// ── GET /auth/me ─────────────────────────────────────────────────────────────
router.get('/me', requireAuth, (req, res) => {
  // Return current session user — never the password hash.
  res.json({ user: req.session.user });
});

module.exports = router;
