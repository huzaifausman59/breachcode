'use strict';
/**
 * Report export — sanitized CSV + printable HTML.
 *
 * WHY pseudonymised participant data:
 *   The spec requires sanitized exports. We replace email addresses
 *   with participant IDs only. No raw PII in the export (TH12).
 *   Rule versions and thresholds ARE included so decisions are
 *   reproducible by a reviewer.
 */
const router = require('express').Router();
const { requireAuth, requireRole, ROLES } = require('../../security/auth/rbac');
const { createError }  = require('../errorHandler');
const { appendAudit }  = require('../../security/audit/log');
const campaignRepo     = require('../../repo/campaignRepo');
const eventRepo        = require('../../repo/eventRepo');
const resultRepo       = require('../../repo/resultRepo');
const config           = require('../../config');

router.use(requireAuth, requireRole(ROLES.OPERATOR));

router.get('/campaign/:id', async (req, res, next) => {
  try {
    const campaign = campaignRepo.findById(req.params.id);
    if (!campaign) return next(createError('E_NOT_FOUND', 'Campaign not found.'));

    const events   = eventRepo.listEventsForCampaign(campaign.id);
    const summary  = eventRepo.summariseForCampaign(campaign.id);
    const results  = resultRepo.listResults({ entity_type: 'template', entity_id: campaign.template_id });
    const format   = req.query.format || 'html';

    await appendAudit({
      actorId: req.session.user.id, actorRole: req.session.user.role,
      action: 'export.report', targetType: 'campaign', targetId: campaign.id,
      outcome: 'success', requestId: req.id, ip: req.ip,
    });

    if (format === 'csv') {
      // CSV — pseudonymised (participant_id only, no email).
      const lines = ['participant_id,event_type,occurred_at,risk_level'];
      for (const e of events) {
        lines.push(`${e.participant_id},${e.event_type},${e.occurred_at},${e.risk_level || 'low'}`);
      }
      res.set('Content-Type', 'text/csv');
      res.set('Content-Disposition', `attachment; filename="campaign_${campaign.id}_report.csv"`);
      return res.send(lines.join('\r\n'));
    }

    // HTML printable report.
    const latestResult = results[0];
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>Campaign Report — ${campaign.name}</title>
  <style>
    body{font-family:sans-serif;max-width:900px;margin:40px auto;padding:0 20px;color:#333}
    h1{font-size:24px;margin-bottom:4px}
    .meta{color:#666;font-size:13px;margin-bottom:32px}
    h2{font-size:17px;margin:28px 0 12px;border-bottom:1px solid #eee;padding-bottom:6px}
    table{width:100%;border-collapse:collapse;font-size:13px}
    th{text-align:left;padding:8px 10px;background:#f5f5f5;border-bottom:2px solid #ddd}
    td{padding:8px 10px;border-bottom:1px solid #eee}
    .badge{display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600}
    .high{background:#ffebee;color:#c62828}
    .medium{background:#fff8e1;color:#f57f17}
    .low{background:#e8f5e9;color:#2e7d32}
    .footer{margin-top:40px;font-size:11px;color:#999;border-top:1px solid #eee;padding-top:12px}
  </style>
</head>
<body>
  <h1>Campaign Report: ${campaign.name}</h1>
  <p class="meta">
    Organisation: ${config.app.orgName} &nbsp;|&nbsp;
    Phase: ${campaign.phase} &nbsp;|&nbsp;
    Status: ${campaign.status} &nbsp;|&nbsp;
    Generated: ${new Date().toISOString()}
  </p>

  <h2>Summary</h2>
  <table>
    <tr><th>Metric</th><th>Count</th></tr>
    <tr><td>Total sent</td><td>${summary.total_sent}</td></tr>
    <tr><td>Opened</td><td>${summary.opened}</td></tr>
    <tr><td>Clicked</td><td>${summary.clicked}</td></tr>
    <tr><td>Submitted (credentials discarded)</td><td>${summary.submitted}</td></tr>
    <tr><td>Reported</td><td>${summary.reported}</td></tr>
    <tr><td>Opted out</td><td>${summary.opted_out}</td></tr>
  </table>

  ${latestResult ? `
  <h2>Template Analysis (engine v${latestResult.engine_version})</h2>
  <p>Risk level: <span class="badge ${latestResult.risk_level}">${latestResult.risk_level.toUpperCase()}</span>
     &nbsp; Decision: <strong>${latestResult.decision}</strong>
     &nbsp; Score: ${latestResult.total_score}</p>
  <p>${latestResult.summary}</p>
  ${latestResult.reasons && latestResult.reasons.length > 0 ? `
  <table>
    <tr><th>Indicator</th></tr>
    ${latestResult.reasons.map((r) => `<tr><td>${r}</td></tr>`).join('')}
  </table>` : ''}
  ` : ''}

  <h2>Events (pseudonymised — participant IDs only)</h2>
  <table>
    <tr><th>Participant ID</th><th>Event</th><th>Time</th><th>Risk</th></tr>
    ${events.map((e) => `
    <tr>
      <td>${e.participant_id}</td>
      <td>${e.event_type}</td>
      <td>${e.occurred_at}</td>
      <td><span class="badge ${e.risk_level || 'low'}">${(e.risk_level || 'low').toUpperCase()}</span></td>
    </tr>`).join('')}
  </table>

  <div class="footer">
    <p>CONFIDENTIAL — For internal security training use only.</p>
    <p>Participant emails are not included in this report (privacy policy).</p>
    <p>No real credentials were collected during this simulation.</p>
  </div>
</body>
</html>`;

    res.set('Content-Type', 'text/html');
    res.send(html);
  } catch (err) { next(err); }
});

module.exports = router;
