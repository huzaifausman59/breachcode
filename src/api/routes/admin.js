'use strict';
/**
 * Admin routes — user management, audit log, chain verification.
 * Every route here requires role='admin' (enforced server-side).
 */

const router = require('express').Router();

const { requireAuth, requireRole, ROLES } = require('../../security/auth/rbac');
const { validate }          = require('../middleware/validate');
const { createUserSchema, updateUserSchema } = require('../schemas/auth.schema');
const { createError }       = require('../errorHandler');
const { appendAudit }       = require('../../security/audit/log');
const { verifyChain }       = require('../../security/audit/verify');
const { hashPassword }      = require('../../security/auth/hash');
const userRepo              = require('../../repo/userRepo');
const auditRepo             = require('../../repo/auditRepo');

// All admin routes require auth + admin role.
router.use(requireAuth, requireRole(ROLES.ADMIN));

// ── GET /admin/users ────────────────────────────────────────────────────────
router.get('/users', (req, res) => {
  const users = userRepo.listUsers();
  res.json({ users });
});

// ── POST /admin/users ───────────────────────────────────────────────────────
router.post('/users', validate(createUserSchema), async (req, res, next) => {
  const { username, password, role } = req.validated;
  try {
    const hash = await hashPassword(password);
    const user = userRepo.createUser({ username, password_hash: hash, role });

    await appendAudit({
      actorId: req.session.user.id, actorRole: req.session.user.role,
      action: 'user.create', targetType: 'user', targetId: user.id,
      outcome: 'success', detail: { username, role },
      requestId: req.id, ip: req.ip,
    });

    res.status(201).json({ user });
  } catch (err) {
    // Unique constraint violation = duplicate username.
    if (err.message && err.message.includes('UNIQUE')) {
      return next(createError('E_CONFLICT', 'Username already exists.'));
    }
    next(err);
  }
});

// ── PUT /admin/users/:id ────────────────────────────────────────────────────
router.put('/users/:id', validate(updateUserSchema), async (req, res, next) => {
  const { id } = req.params;
  const { role, is_active } = req.validated; // confirm already validated by schema

  // Prevent admin from disabling their own account.
  if (id === req.session.user.id && is_active === false) {
    return next(createError('E_VALIDATION', 'You cannot disable your own account.'));
  }

  const existing = userRepo.findSafeById(id);
  if (!existing) return next(createError('E_NOT_FOUND', 'User not found.'));

  userRepo.updateUser(id, { role, is_active });

  await appendAudit({
    actorId: req.session.user.id, actorRole: req.session.user.role,
    action: 'user.update', targetType: 'user', targetId: id,
    outcome: 'success', detail: { role, is_active },
    requestId: req.id, ip: req.ip,
  });

  res.json({ user: userRepo.findSafeById(id) });
});

// ── GET /admin/audit ────────────────────────────────────────────────────────
router.get('/audit', (req, res) => {
  const page     = Math.max(1, parseInt(req.query.page     || '1',  10));
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize || '50', 10)));
  const action   = req.query.action   || undefined;
  const actorId  = req.query.actorId  || undefined;

  const result = auditRepo.listAuditEvents({ page, pageSize, action, actorId });
  res.json(result);
});

// ── GET /admin/audit/verify ─────────────────────────────────────────────────
router.get('/audit/verify', (req, res) => {
  const result = verifyChain();
  // 200 whether ok or not — the payload tells the story.
  res.json(result);
});

module.exports = router;
