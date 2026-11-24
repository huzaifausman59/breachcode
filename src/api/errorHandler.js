'use strict';
/**
 * Global Express error handler.
 *
 * WHY this exists as a dedicated module:
 *   Every thrown error or next(err) call lands here.
 *   This single point guarantees:
 *     1. No stack trace ever reaches the client (TH8).
 *     2. Every response uses a stable error code (see docs/data-model.md §8).
 *     3. Errors are logged server-side with full detail for debugging.
 *
 * Order matters: this must be registered AFTER all routes in app.js.
 */

const logger = require('../config/logger');

// Map known operational error types to stable codes + HTTP status.
const CODE_MAP = {
  E_VALIDATION:    400,
  E_FILE:          400,
  E_AUTH:          401,
  E_FORBIDDEN:     403,
  E_NOT_FOUND:     404,
  E_CONFLICT:      409,
  E_CONSENT:       422,
  E_CAMPAIGN_STATE:422,
  E_CONFIRM:       422,
  E_RATE_LIMIT:    429,
  E_INTERNAL:      500,
};

/**
 * Creates a structured operational error.
 * Use this in services/routes instead of `throw new Error(...)`.
 *
 * @param {string} code   - Stable error code from CODE_MAP.
 * @param {string} message - Safe, user-facing message (no internal detail).
 * @param {object} [extra] - Extra fields (fields[], retry_after, etc.)
 */
function createError(code, message, extra = {}) {
  const err = new Error(message);
  err.code    = code;
  err.isOp    = true; // mark as operational (not programming error)
  err.status  = CODE_MAP[code] || 500;
  err.extra   = extra;
  return err;
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err.isOp) {
    // Operational error — expected, safe to describe to client.
    logger.warn({ code: err.code, path: req.path, requestId: req.id }, err.message);
    return res.status(err.status).json({
      error: {
        code:    err.code,
        message: err.message,
        ...err.extra,
      },
    });
  }

  // Programming error or unexpected failure — log internally, never expose detail.
  logger.error({ err, path: req.path, requestId: req.id }, 'Unhandled server error');
  return res.status(500).json({
    error: { code: 'E_INTERNAL', message: 'An internal error occurred.' },
  });
}

module.exports = { errorHandler, createError };
