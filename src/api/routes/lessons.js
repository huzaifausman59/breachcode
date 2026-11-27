'use strict';
const router = require('express').Router();
const { requireAuth, requireRole, ROLES } = require('../../security/auth/rbac');
const { validate }     = require('../middleware/validate');
const { lessonSchema } = require('../schemas/template.schema');
const { createError }  = require('../errorHandler');
const { appendAudit }  = require('../../security/audit/log');
const lessonRepo       = require('../../repo/lessonRepo');

// ── GET /lessons/by-template/:templateId — public (for landing page) ─────────
router.get('/by-template/:templateId', (req, res) => {
  const lesson = lessonRepo.findByTemplateId(req.params.templateId);
  if (!lesson) return res.json({ lesson: null });
  // Return safe fields only — no internal IDs beyond what's needed.
  let indicators = [];
  try { indicators = JSON.parse(lesson.indicators || '[]'); } catch { indicators = []; }
  res.json({ lesson: { id: lesson.id, title: lesson.title, content_html: lesson.content_html, indicators } });
});

// All remaining routes require auth.
router.use(requireAuth, requireRole(ROLES.OPERATOR));

router.get('/', (_req, res) => {
  const lessons = lessonRepo.listLessons();
  res.json({ lessons });
});

router.get('/:id', (req, res, next) => {
  const l = lessonRepo.findById(req.params.id);
  if (!l) return next(createError('E_NOT_FOUND', 'Lesson not found.'));
  res.json({ lesson: l });
});

router.post('/', validate(lessonSchema), async (req, res, next) => {
  try {
    const l = lessonRepo.createLesson({ ...req.validated, created_by: req.session.user.id });
    await appendAudit({
      actorId: req.session.user.id, actorRole: req.session.user.role,
      action: 'lesson.create', targetType: 'lesson', targetId: l.id,
      outcome: 'success', detail: { title: l.title },
      requestId: req.id, ip: req.ip,
    });
    res.status(201).json({ lesson: l });
  } catch (err) { next(err); }
});

router.put('/:id', validate(lessonSchema), async (req, res, next) => {
  try {
    const existing = lessonRepo.findById(req.params.id);
    if (!existing) return next(createError('E_NOT_FOUND', 'Lesson not found.'));
    const l = lessonRepo.updateLesson(req.params.id, req.validated);
    res.json({ lesson: l });
  } catch (err) { next(err); }
});

module.exports = router;
