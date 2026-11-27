'use strict';
/**
 * Mail sender — wraps Nodemailer, points ONLY to MailHog.
 *
 * WHY hard-coded to MailHog:
 *   The spec forbids sending to real external targets.
 *   We validate SMTP_HOST is localhost/127.0.0.1 at startup
 *   to prevent accidental misconfiguration.
 *
 * Every send is consent-checked here as a final safety net
 * in addition to the campaign service check (defence in depth, TH11).
 */

const nodemailer = require('nodemailer');
const config     = require('../config');
const logger     = require('../config/logger');
const { checkConsent } = require('../security/engine/consentPolicy');

// Fail fast if someone accidentally points at a real SMTP server.
const ALLOWED_SMTP_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
if (!ALLOWED_SMTP_HOSTS.has(config.smtp.host)) {
  throw new Error(
    `SMTP_HOST must be localhost for local MailHog. Got: "${config.smtp.host}". ` +
    `Real external SMTP is not permitted (spec §2).`
  );
}

const transporter = nodemailer.createTransport({
  host: config.smtp.host,
  port: config.smtp.port,
  secure: false,         // MailHog does not use TLS
  ignoreTLS: true,
  tls: { rejectUnauthorized: false },
});

/**
 * Send one phishing simulation email to a single recipient.
 *
 * @param {object} opts
 * @param {object} opts.participant  - participant row (must have consent fields)
 * @param {object} opts.template    - template row
 * @param {string} opts.trackingToken - unique per-recipient token
 * @returns {Promise<{ sent: boolean, reason: string }>}
 */
async function sendSimulationEmail({ participant, template, trackingToken }) {
  // Final consent check — belt-and-suspenders (TH11).
  const consent = checkConsent(participant);
  if (!consent.permitted) {
    logger.warn({ participantId: participant.id }, `Send blocked: ${consent.reason}`);
    return { sent: false, reason: consent.reason };
  }

  const baseUrl    = config.app.baseUrl;
  const openUrl    = `${baseUrl}/api/v1/t/o/${trackingToken}`;
  const clickUrl   = `${baseUrl}/api/v1/t/c/${trackingToken}`;
  const reportUrl  = `${baseUrl}/api/v1/t/r/${trackingToken}`;
  const optOutUrl  = `${baseUrl}/api/v1/t/x/${trackingToken}`;

  // Inject tracking pixel and replace placeholder links in template HTML.
  let html = template.html_body || '';

  // Wrap all <a href> links with the click-tracking redirect.
  // WHY: we do NOT replace the actual href to preserve the simulated deception;
  // instead we add a data attribute and the tracking happens via the click route.
  // The click route records the event then redirects to the simulated landing page.
  html = html.replace(/<a\s/gi, `<a data-track="${clickUrl}" `);

  // Replace first link href with click tracking URL for the simulation.
  html = html.replace(/href=["'][^"']+["']/i, `href="${clickUrl}"`);

  // Tracking pixel — 1×1 transparent gif (opened event).
  const pixel = `<img src="${openUrl}" width="1" height="1" style="display:none" alt="" />`;
  html = html + pixel;

  // Footer with report and opt-out links — required for ethical simulation.
  const footer = `
    <hr style="margin-top:40px"/>
    <p style="font-size:11px;color:#888;">
      This is a security awareness training simulation from ${config.app.orgName}.<br/>
      <a href="${reportUrl}">Report this email as phishing</a> |
      <a href="${optOutUrl}">Opt out of future training emails</a>
    </p>`;
  html = html + footer;

  try {
    await transporter.sendMail({
      from:    `"${template.sender_name}" <${template.sender_email}>`,
      to:      participant.email,
      subject: template.subject,
      html,
      text:    template.text_body || '',
    });

    logger.info({ participantId: participant.id }, 'Simulation email sent to MailHog');
    return { sent: true, reason: 'ok' };
  } catch (err) {
    logger.error({ err, participantId: participant.id }, 'Failed to send simulation email');
    return { sent: false, reason: err.message };
  }
}

module.exports = { sendSimulationEmail };
