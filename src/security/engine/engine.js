'use strict';
/**
 * Security Engine — main entry point.
 *
 * analyzeTemplate(template, rules) is the only public function.
 * It is a pure function when rules are passed in — no DB access here.
 * The service layer (src/services/templates.js) fetches rules from
 * the DB and passes them in, keeping the engine independently testable.
 *
 * Every output includes rule_id, rule_name, rule_version, weight,
 * threshold, engine_version so decisions are fully reproducible (spec req).
 */

const { v4: uuid } = require('uuid');

const urgencyLanguage  = require('./rules/urgencyLanguage');
const genericGreeting  = require('./rules/genericGreeting');
const mismatchedLink   = require('./rules/mismatchedLink');
const suspiciousTld    = require('./rules/suspiciousTld');
const senderMismatch   = require('./rules/senderMismatch');
const credentialRequest = require('./rules/credentialRequest');
const { score }        = require('./scorer');

const ENGINE_VERSION = '1.0.0';

// Map rule_id → rule module. Order does not affect scoring.
const RULE_MODULES = {
  urgency_language:   urgencyLanguage,
  generic_greeting:   genericGreeting,
  mismatched_link:    mismatchedLink,
  suspicious_tld:     suspiciousTld,
  sender_mismatch:    senderMismatch,
  credential_request: credentialRequest,
};

// Default rules used when no DB rules are available (e.g. in unit tests).
const DEFAULT_RULES = [
  { rule_id: 'urgency_language',   rule_name: 'Urgency Language Detector',          version: 1, weight: 2.0, threshold: 5.0 },
  { rule_id: 'generic_greeting',   rule_name: 'Generic Greeting Detector',           version: 1, weight: 1.0, threshold: 5.0 },
  { rule_id: 'mismatched_link',    rule_name: 'Mismatched Link Text vs Href',        version: 1, weight: 3.0, threshold: 5.0 },
  { rule_id: 'suspicious_tld',     rule_name: 'Suspicious TLD or Lookalike Domain',  version: 1, weight: 2.5, threshold: 5.0 },
  { rule_id: 'sender_mismatch',    rule_name: 'Display Name / Sender Mismatch',      version: 1, weight: 2.0, threshold: 5.0 },
  { rule_id: 'credential_request', rule_name: 'Credential Request Wording',          version: 1, weight: 3.0, threshold: 5.0 },
];

/**
 * Analyse a template against all active rules.
 *
 * @param {object}   template  - { subject, sender_name, sender_email, html_body, text_body }
 * @param {object[]} [rules]   - rows from rules table (active only). Falls back to DEFAULT_RULES.
 * @returns {object} AnalysisResult — stored in results table and returned to client
 */
function analyzeTemplate(template, rules) {
  const activeRules = (rules && rules.length > 0)
    ? rules.filter((r) => r.is_active !== 0)
    : DEFAULT_RULES;

  // Use average threshold across active rules as global threshold.
  const globalThreshold = activeRules.reduce((sum, r) => sum + r.threshold, 0) / activeRules.length;

  const ruleResults = [];

  for (const rule of activeRules) {
    const mod = RULE_MODULES[rule.rule_id];
    if (!mod) continue; // unknown rule_id — skip gracefully

    const result = mod.run(template, rule);
    ruleResults.push(result);
  }

  const { totalScore, riskLevel, decision, indicators_matched, reasons, summary } =
    score(ruleResults, globalThreshold);

  return {
    id:             uuid(),
    entity_type:    'template',
    entity_id:      template.id || null,
    engine_version: ENGINE_VERSION,
    evaluated_at:   new Date().toISOString(),
    rules_applied:  ruleResults,
    total_score:    totalScore,
    risk_level:     riskLevel,
    decision,
    indicators_matched,
    reasons,
    summary,
  };
}

module.exports = { analyzeTemplate, ENGINE_VERSION, DEFAULT_RULES };
