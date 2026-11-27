'use strict';
const router = require('express').Router();
const { requireAuth, requireRole, ROLES } = require('../../security/auth/rbac');
const { validate }       = require('../middleware/validate');
const { templateSchema } = require('../schemas/template.schema');
const { createError }    = require('../errorHandler');
const { appendAudit }    = require('../../security/audit/log');
const templateRepo       = require('../../repo/templateRepo');
const ruleRepo           = require('../../repo/ruleRepo');
const resultRepo         = require('../../repo/resultRepo');
const lessonRepo         = require('../../repo/lessonRepo');
const { analyzeTemplate } = require('../../security/engine/engine');

router.use(requireAuth, requireRole(ROLES.OPERATOR));

// ── GET /templates ───────────────────────────────────────────────────────────
router.get('/', (_req, res) => {
  const templates = templateRepo.listTemplates();
  res.json({ templates });
});

// ── GET /templates/:id ───────────────────────────────────────────────────────
router.get('/:id', (req, res, next) => {
  const t = templateRepo.findById(req.params.id);
  if (!t) return next(createError('E_NOT_FOUND', 'Template not found.'));
  const result  = t.indicator_result ? JSON.parse(t.indicator_result) : null;
  const lesson  = lessonRepo.findByTemplateId(t.id);
  res.json({ template: { ...t, html_body: undefined }, result, lesson });
});

// ── POST /templates ──────────────────────────────────────────────────────────
router.post('/', validate(templateSchema), async (req, res, next) => {
  try {
    const t       = templateRepo.createTemplate({ ...req.validated, created_by: req.session.user.id });
    const rules   = ruleRepo.listActiveRules();
    const analysis = analyzeTemplate(t, rules);
    const saved   = resultRepo.saveResult({ entity_type: 'template', entity_id: t.id, ...analysis });
    templateRepo.saveIndicatorResult(t.id, JSON.stringify(analysis));

    await appendAudit({
      actorId: req.session.user.id, actorRole: req.session.user.role,
      action: 'template.create', targetType: 'template', targetId: t.id,
      outcome: 'success', detail: { name: t.name, risk_level: analysis.risk_level },
      requestId: req.id, ip: req.ip,
    });

    res.status(201).json({ template: { ...t, html_body: undefined }, result: saved });
  } catch (err) { next(err); }
});

// ── PUT /templates/:id ───────────────────────────────────────────────────────
router.put('/:id', validate(templateSchema), async (req, res, next) => {
  try {
    const existing = templateRepo.findById(req.params.id);
    if (!existing) return next(createError('E_NOT_FOUND', 'Template not found.'));

    const t       = templateRepo.updateTemplate(req.params.id, req.validated);
    const rules   = ruleRepo.listActiveRules();
    const analysis = analyzeTemplate(t, rules);
    resultRepo.saveResult({ entity_type: 'template', entity_id: t.id, ...analysis });
    templateRepo.saveIndicatorResult(t.id, JSON.stringify(analysis));

    await appendAudit({
      actorId: req.session.user.id, actorRole: req.session.user.role,
      action: 'template.update', targetType: 'template', targetId: t.id,
      outcome: 'success', detail: { name: t.name },
      requestId: req.id, ip: req.ip,
    });

    res.json({ template: { ...t, html_body: undefined }, result: analysis });
  } catch (err) { next(err); }
});

// ── POST /templates/:id/analyze ──────────────────────────────────────────────
router.post('/:id/analyze', async (req, res, next) => {
  try {
    const t = templateRepo.findById(req.params.id);
    if (!t) return next(createError('E_NOT_FOUND', 'Template not found.'));
    const rules    = ruleRepo.listActiveRules();
    const analysis = analyzeTemplate(t, rules);
    const saved    = resultRepo.saveResult({ entity_type: 'template', entity_id: t.id, ...analysis });
    templateRepo.saveIndicatorResult(t.id, JSON.stringify(analysis));
    res.json({ result: saved });
  } catch (err) { next(err); }
});

// ── DELETE /templates/:id (admin only) ───────────────────────────────────────
router.delete('/:id', requireRole(ROLES.ADMIN), async (req, res, next) => {
  try {
    const existing = templateRepo.findById(req.params.id);
    if (!existing) return next(createError('E_NOT_FOUND', 'Template not found.'));
    templateRepo.deleteTemplate(req.params.id);
    await appendAudit({
      actorId: req.session.user.id, actorRole: req.session.user.role,
      action: 'template.delete', targetType: 'template', targetId: req.params.id,
      outcome: 'success', requestId: req.id, ip: req.ip,
    });
    res.json({ message: 'Template deleted.' });
  } catch (err) { next(err); }
});

module.exports = router;
