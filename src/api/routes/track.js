'use strict';
/**
 * Tracking routes — no authentication (token-authenticated via URL).
 * These are the public endpoints that email recipients interact with.
 *
 * CRITICAL SECURITY NOTE (FR-3, T1, TH1):
 *   POST /t/s/:token (form submit) DISCARDS ALL FORM BODY DATA.
 *   The handler reads ONLY the token from the URL.
 *   No password, username, or any credential field is ever read,
 *   stored, or logged. The landing page carries a visible banner
 *   confirming this ("Nothing you type is stored").
 */

const router  = require('express').Router();
const path    = require('path');
const config  = require('../../config');
const campaignRepo    = require('../../repo/campaignRepo');
const eventRepo       = require('../../repo/eventRepo');
const participantRepo = require('../../repo/participantRepo');
const lessonRepo      = require('../../repo/lessonRepo');
const templateRepo    = require('../../repo/templateRepo');
const { scoreEvent }  = require('../../security/engine/eventScorer');
const { appendAudit } = require('../../security/audit/log');

// 1×1 transparent GIF — the open tracking pixel.
// Escape operator-supplied text before putting it into HTML shown to participants.
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

const TRANSPARENT_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

/**
 * Resolve and validate a tracking token.
 * Returns the recipient row or null.
 */
function resolveToken(token) {
  if (!token || !/^[0-9a-f]{32}$/.test(token)) return null;
  return campaignRepo.findRecipientByToken(token);
}

// ── GET /t/o/:token — open pixel (FR-4) ──────────────────────────────────────
router.get('/o/:token', async (req, res) => {
  // Always return the pixel regardless of token validity (no info leak).
  res.set('Content-Type', 'image/gif');
  res.set('Cache-Control', 'no-store');
  res.send(TRANSPARENT_GIF);

  const recipient = resolveToken(req.params.token);
  if (!recipient) return;

  eventRepo.recordEvent({
    campaign_recipient_id: recipient.id,
    event_type: 'opened',
    ip:         req.ip,
    user_agent: req.headers['user-agent'],
    risk_level: scoreEvent('opened').riskLevel,
  });
});

// ── GET /t/c/:token — click tracking → redirect to landing page (FR-4) ───────
router.get('/c/:token', async (req, res) => {
  const recipient = resolveToken(req.params.token);
  if (!recipient) {
    return res.redirect(`${config.app.baseUrl}/404.html`);
  }

  eventRepo.recordEvent({
    campaign_recipient_id: recipient.id,
    event_type: 'clicked',
    ip:         req.ip,
    user_agent: req.headers['user-agent'],
    risk_level: scoreEvent('clicked').riskLevel,
  });

  // Redirect to simulated landing page (FR-3).
  res.redirect(`/api/v1/t/landing/${req.params.token}`);
});

// ── GET /landing/:token — simulated landing page (FR-3) ──────────────────────
router.get('/landing/:token', (req, res, next) => {
  const recipient = resolveToken(req.params.token);
  if (!recipient) return res.status(404).send('Not found.');

  // Get the template so we can show which org was spoofed in the lesson link.
  const campaign = require('../../repo/campaignRepo').findById(recipient.campaign_id);
  const template = campaign ? templateRepo.findById(campaign.template_id) : null;
  const orgName  = template ? template.sender_name : config.app.orgName;

  // Landing page — credentials discarded by design.
  // The form posts to /t/s/:token which reads NOTHING from the body (TH1).
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Sign In — ${esc(orgName)}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:sans-serif;background:#f5f5f5;display:flex;flex-direction:column;align-items:center;min-height:100vh}
    .banner{width:100%;background:#d32f2f;color:#fff;text-align:center;padding:14px 20px;font-size:14px;font-weight:600;letter-spacing:.3px}
    .card{background:#fff;border-radius:8px;box-shadow:0 2px 12px rgba(0,0,0,.1);padding:40px;margin-top:40px;width:100%;max-width:400px}
    h1{font-size:22px;margin-bottom:24px;color:#333}
    label{display:block;font-size:13px;color:#555;margin-bottom:4px}
    input{width:100%;padding:10px 12px;border:1px solid #ccc;border-radius:4px;font-size:14px;margin-bottom:16px}
    button{width:100%;padding:11px;background:#1976d2;color:#fff;border:none;border-radius:4px;font-size:15px;cursor:pointer}
    button:hover{background:#1565c0}
    .footer{margin-top:16px;font-size:12px;color:#888;text-align:center}
  </style>
</head>
<body>
  <div class="banner" role="alert">
    ⚠️ This is a <strong>security awareness training simulation</strong> from ${config.app.orgName}.
    <strong>Nothing you type is stored.</strong>
  </div>
  <div class="card">
    <h1>Sign in to ${esc(orgName)}</h1>
    <form method="POST" action="/api/v1/t/s/${req.params.token}">
      <label for="username">Username or email</label>
      <input id="username" name="username" type="text" autocomplete="username" aria-label="Username"/>
      <label for="password">Password</label>
      <input id="password" name="password" type="password" autocomplete="current-password" aria-label="Password"/>
      <button type="submit">Sign in</button>
    </form>
    <p class="footer">Forgot your password? <a href="#">Reset it</a></p>
  </div>
</body>
</html>`;

  res.set('Content-Type', 'text/html');
  res.send(html);
});

// ── POST /t/s/:token — form submit, credentials DISCARDED (FR-3, T1, TH1) ────
router.post('/s/:token', async (req, res) => {
  /**
   * INTENTIONALLY do not read req.body.
   * The form sends username and password but we immediately discard them.
   * We record only "submitted: yes" via the event system.
   * This is the core credential-non-collection guarantee.
   */
  const recipient = resolveToken(req.params.token);
  if (!recipient) return res.redirect('/');

  eventRepo.recordEvent({
    campaign_recipient_id: recipient.id,
    event_type: 'submitted',
    ip:         req.ip,
    user_agent: req.headers['user-agent'],
    risk_level: scoreEvent('submitted').riskLevel,
  });

  // Redirect to the micro-lesson immediately.
  res.redirect(`/api/v1/t/lesson/${req.params.token}`);
});

// ── GET /t/lesson/:token — lesson after click/submit (FR-5) ──────────────────
router.get('/lesson/:token', (req, res) => {
  const recipient = resolveToken(req.params.token);
  if (!recipient) return res.status(404).send('Not found.');

  const campaign = require('../../repo/campaignRepo').findById(recipient.campaign_id);
  const lesson   = campaign ? lessonRepo.findByTemplateId(campaign.template_id) : null;

  let indicators = [];
  try { indicators = lesson ? JSON.parse(lesson.indicators || '[]') : []; } catch { indicators = []; }

  const title   = lesson ? lesson.title        : 'Phishing Awareness';
  const content = lesson ? lesson.content_html : '<p>This was a simulated phishing email. Always verify the sender before clicking links or entering credentials.</p>';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Security Lesson — ${config.app.orgName}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:sans-serif;background:#f5f5f5;display:flex;flex-direction:column;align-items:center;padding:40px 20px;min-height:100vh}
    .card{background:#fff;border-radius:8px;box-shadow:0 2px 12px rgba(0,0,0,.1);padding:40px;width:100%;max-width:680px}
    h1{font-size:24px;margin-bottom:8px;color:#c62828}
    .subtitle{font-size:14px;color:#666;margin-bottom:28px}
    h2{font-size:16px;margin:24px 0 10px;color:#333}
    .indicator{background:#fff3e0;border-left:4px solid #f57c00;padding:10px 14px;margin-bottom:8px;border-radius:0 4px 4px 0;font-size:14px}
    .content{font-size:15px;line-height:1.6;color:#444}
    .done{margin-top:32px;text-align:center}
    .done a{display:inline-block;padding:10px 28px;background:#2e7d32;color:#fff;border-radius:4px;text-decoration:none;font-size:15px}
  </style>
</head>
<body>
  <div class="card">
    <h1>🎓 ${esc(title)}</h1>
    <p class="subtitle">This was a simulated phishing email sent as part of your security awareness training at ${config.app.orgName}.</p>
    ${indicators.length > 0 ? `
    <h2>Red flags in this email:</h2>
    ${indicators.map((ind) => `<div class="indicator">⚠️ ${esc(ind)}</div>`).join('')}
    ` : ''}
    <h2>What to remember:</h2>
    <div class="content">${content}</div>
    <div class="done"><a href="/">Return to portal</a></div>
  </div>
</body>
</html>`;

  res.set('Content-Type', 'text/html');
  res.send(html);
});

// ── GET /t/r/:token — report phishing (FR-4) ─────────────────────────────────
router.get('/r/:token', async (req, res) => {
  const recipient = resolveToken(req.params.token);
  if (!recipient) return res.redirect('/');

  eventRepo.recordEvent({
    campaign_recipient_id: recipient.id,
    event_type: 'reported',
    ip:         req.ip,
    user_agent: req.headers['user-agent'],
    risk_level: 'low',
  });

  res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>Thank You</title></head>
<body style="font-family:sans-serif;text-align:center;padding:60px">
  <h1 style="color:#2e7d32">✓ Report received</h1>
  <p>Well done! You correctly identified this as a simulated phishing email.</p>
  <p style="margin-top:16px"><a href="/">Return to portal</a></p>
</body></html>`);
});

// ── GET /t/x/:token — opt out (T2) ───────────────────────────────────────────
router.get('/x/:token', async (req, res) => {
  const recipient = resolveToken(req.params.token);
  if (!recipient) return res.redirect('/');

  participantRepo.optOutByToken(req.params.token);

  eventRepo.recordEvent({
    campaign_recipient_id: recipient.id,
    event_type: 'opted_out',
    ip:         req.ip,
    user_agent: req.headers['user-agent'],
    risk_level: 'low',
  });

  await appendAudit({
    action: 'participant.optout', targetType: 'participant',
    targetId: recipient.participant_id,
    outcome: 'success', requestId: req.id, ip: req.ip,
  });

  res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>Opted Out</title></head>
<body style="font-family:sans-serif;text-align:center;padding:60px">
  <h1>You have opted out</h1>
  <p>You will not receive future training simulation emails.</p>
  <p style="margin-top:16px"><a href="/">Return to portal</a></p>
</body></html>`);
});

module.exports = router;
