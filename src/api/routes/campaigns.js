'use strict';
const router   = require('express').Router();
const crypto   = require('crypto');
const { requireAuth, requireRole, ROLES } = require('../../security/auth/rbac');
const { validate }       = require('../middleware/validate');
const { campaignSchema } = require('../schemas/template.schema');
const { createError }    = require('../errorHandler');
const { appendAudit }    = require('../../security/audit/log');
const campaignRepo       = require('../../repo/campaignRepo');
const participantRepo    = require('../../repo/participantRepo');
const templateRepo       = require('../../repo/templateRepo');
const eventRepo          = require('../../repo/eventRepo');
const { sendSimulationEmail } = require('../../mail/sender');
const { filterConsented }     = require('../../security/engine/consentPolicy');
const { scoreEvent }          = require('../../security/engine/eventScorer');
const logger = require('../../config/logger');

router.use(requireAuth, requireRole(ROLES.OPERATOR));

// ── GET /campaigns ───────────────────────────────────────────────────────────
router.get('/', (_req, res) => {
  res.json({ campaigns: campaignRepo.listCampaigns() });
});

// ── GET /campaigns/:id ───────────────────────────────────────────────────────
router.get('/:id', (req, res, next) => {
  const c = campaignRepo.findById(req.params.id);
  if (!c) return next(createError('E_NOT_FOUND', 'Campaign not found.'));
  const recipients = campaignRepo.listRecipients(req.params.id);
  const summary    = eventRepo.summariseForCampaign(req.params.id);
  res.json({ campaign: c, recipients, summary });
});

// ── POST /campaigns ──────────────────────────────────────────────────────────
router.post('/', validate(campaignSchema), async (req, res, next) => {
  try {
    const { name, template_id, phase, pre_campaign_id } = req.validated;

    const template = templateRepo.findById(template_id);
    if (!template) return next(createError('E_NOT_FOUND', 'Template not found.'));

    if (phase === 'post' && pre_campaign_id) {
      const pre = campaignRepo.findById(pre_campaign_id);
      if (!pre) return next(createError('E_NOT_FOUND', 'Pre-training campaign not found.'));
    }

    const campaign = campaignRepo.createCampaign({
      name, template_id, phase, pre_campaign_id: pre_campaign_id || null,
      created_by: req.session.user.id,
    });

    await appendAudit({
      actorId: req.session.user.id, actorRole: req.session.user.role,
      action: 'campaign.create', targetType: 'campaign', targetId: campaign.id,
      outcome: 'success', detail: { name, phase },
      requestId: req.id, ip: req.ip,
    });

    res.status(201).json({ campaign });
  } catch (err) { next(err); }
});

// ── POST /campaigns/:id/send ─────────────────────────────────────────────────
router.post('/:id/send', async (req, res, next) => {
  // confirm gate — high-impact action (spec req).
  if (req.body.confirm !== true) {
    return next(createError('E_CONFIRM', 'Sending a campaign requires confirm: true.'));
  }

  try {
    const campaign = campaignRepo.findById(req.params.id);
    if (!campaign) return next(createError('E_NOT_FOUND', 'Campaign not found.'));
    if (campaign.status !== 'draft') {
      return next(createError('E_CAMPAIGN_STATE', `Campaign is "${campaign.status}" — only draft campaigns can be sent.`));
    }

    const template     = templateRepo.findById(campaign.template_id);
    if (!template) return next(createError('E_NOT_FOUND', 'Campaign template not found.'));

    const allParticipants = participantRepo.listParticipants();
    const { permitted, blocked } = filterConsented(allParticipants);

    campaignRepo.updateStatus(campaign.id, 'sending');

    let sentCount = 0, failedCount = 0;

    for (const { participant } of permitted) {
      // Generate a 128-bit cryptographically random token per recipient (TH10).
      const token = crypto.randomBytes(16).toString('hex');

      campaignRepo.createRecipient({
        campaign_id:    campaign.id,
        participant_id: participant.id,
        token,
      });

      const recipient = campaignRepo.findRecipientByToken(token);

      const { sent, reason } = await sendSimulationEmail({ participant, template, trackingToken: token });

      if (sent) {
        campaignRepo.markRecipientSent(recipient.id);
        // Record 'sent' event.
        eventRepo.recordEvent({
          campaign_recipient_id: recipient.id,
          event_type: 'sent',
          risk_level: 'low',
        });
        sentCount++;
      } else {
        campaignRepo.markRecipientFailed(recipient.id);
        failedCount++;
        logger.warn({ participantId: participant.id, reason }, 'Email send failed');
      }
    }

    campaignRepo.updateStatus(campaign.id, 'active', { sent_at: new Date().toISOString() });

    await appendAudit({
      actorId: req.session.user.id, actorRole: req.session.user.role,
      action: 'campaign.send', targetType: 'campaign', targetId: campaign.id,
      outcome: 'success',
      detail: { sent: sentCount, failed: failedCount, blocked: blocked.length },
      requestId: req.id, ip: req.ip,
    });

    res.json({
      message:  `Campaign sent to ${sentCount} participant(s).`,
      sent:     sentCount,
      failed:   failedCount,
      blocked:  blocked.length,
    });
  } catch (err) { next(err); }
});

// ── POST /campaigns/:id/cancel ───────────────────────────────────────────────
router.post('/:id/cancel', async (req, res, next) => {
  try {
    const campaign = campaignRepo.findById(req.params.id);
    if (!campaign) return next(createError('E_NOT_FOUND', 'Campaign not found.'));
    if (!['draft', 'active', 'sending'].includes(campaign.status)) {
      return next(createError('E_CAMPAIGN_STATE', 'Only draft, sending, or active campaigns can be cancelled.'));
    }
    campaignRepo.updateStatus(campaign.id, 'cancelled');
    await appendAudit({
      actorId: req.session.user.id, actorRole: req.session.user.role,
      action: 'campaign.cancel', targetType: 'campaign', targetId: campaign.id,
      outcome: 'success', requestId: req.id, ip: req.ip,
    });
    res.json({ message: 'Campaign cancelled.' });
  } catch (err) { next(err); }
});

module.exports = router;
