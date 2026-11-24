'use strict';
/**
 * Role-Based Access Control.
 *
 * WHY server-side only:
 *   The frontend may show or hide UI elements by role, but that is
 *   cosmetic only. Every protected endpoint calls requireRole()
 *   which checks req.session.user — a value the client cannot forge
 *   because sessions are stored server-side in SQLite.
 *
 * Satisfies: TH6 (viewer cannot escalate to admin).
 */

const { createError } = require('../../api/errorHandler');
const { appendAudit }  = require('../audit/log');

// Role hierarchy: each role includes all roles to its right.
// 'admin' > 'operator' > 'viewer'
const ROLE_RANK = { admin: 3, operator: 2, viewer: 1 };

/**
 * Permission map — explicit allow list per action.
 * Routes reference these constants so the mapping is in one place.
 */
const ROLES = {
  ADMIN:    'admin',
  OPERATOR: 'operator',
  VIEWER:   'viewer',
};

/**
 * Middleware: require an authenticated session.
 * Returns E_AUTH (401) if not logged in.
 */
function requireAuth(req, res, next) {
  if (!req.session || !req.session.user) {
    return next(createError('E_AUTH', 'Authentication required.'));
  }
  next();
}

/**
 * Middleware factory: require a minimum role level.
 * Returns E_FORBIDDEN (403) + audit log entry on failure.
 *
 * @param {string} minRole - 'admin' | 'operator' | 'viewer'
 */
function requireRole(minRole) {
  return async (req, res, next) => {
    if (!req.session || !req.session.user) {
      return next(createError('E_AUTH', 'Authentication required.'));
    }

    const userRank    = ROLE_RANK[req.session.user.role] || 0;
    const requiredRank = ROLE_RANK[minRole] || 99;

    if (userRank < requiredRank) {
      // Log denied access attempt without exposing what was protected (TH6).
      await appendAudit({
        actorId:    req.session.user.id,
        actorRole:  req.session.user.role,
        action:     'access.denied',
        targetType: 'endpoint',
        targetId:   req.path,
        outcome:    'denied',
        detail:     { requiredRole: minRole, method: req.method },
        requestId:  req.id,
        ip:         req.ip,
      });

      // Generic 403 — do not reveal what resource was protected.
      return next(createError('E_FORBIDDEN', 'Access denied.'));
    }

    next();
  };
}

module.exports = { requireAuth, requireRole, ROLES };
