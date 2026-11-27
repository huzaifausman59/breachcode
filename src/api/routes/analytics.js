'use strict';
const router = require('express').Router();
const { requireAuth, requireRole, ROLES } = require('../../security/auth/rbac');
const { createError }  = require('../errorHandler');
const eventRepo        = require('../../repo/eventRepo');
const campaignRepo     = require('../../repo/campaignRepo');
const { compare }      = require('../../security/engine/prePostComparison');

router.use(requireAuth, requireRole(ROLES.OPERATOR));

// ── GET /analytics/campaign/:id ───────────────────────────────────────────────
router.get('/campaign/:id', (req, res, next) => {
  const campaign = campaignRepo.findById(req.params.id);
  if (!campaign) return next(createError('E_NOT_FOUND', 'Campaign not found.'));
  const summary = eventRepo.summariseForCampaign(req.params.id);
  res.json({ campaign: { id: campaign.id, name: campaign.name, phase: campaign.phase, status: campaign.status }, summary });
});

// ── GET /analytics/prepost/:preId/:postId ─────────────────────────────────────
router.get('/prepost/:preId/:postId', (req, res, next) => {
  const pre  = campaignRepo.findById(req.params.preId);
  const post = campaignRepo.findById(req.params.postId);
  if (!pre)  return next(createError('E_NOT_FOUND', 'Pre-training campaign not found.'));
  if (!post) return next(createError('E_NOT_FOUND', 'Post-training campaign not found.'));

  const preSummary  = eventRepo.summariseForCampaign(pre.id);
  const postSummary = eventRepo.summariseForCampaign(post.id);
  const comparison  = compare(preSummary, postSummary);

  res.json({ pre: { id: pre.id, name: pre.name }, post: { id: post.id, name: post.name }, comparison });
});

module.exports = router;
