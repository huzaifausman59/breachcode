'use strict';
/**
 * Scorer — combines individual rule results into an overall risk assessment.
 *
 * WHY store snapshot values (weight, threshold, version) with each result:
 *   Admin can change thresholds at any time. Storing the values used
 *   at analysis time means every result is reproducible even after
 *   a rule is updated. Required by the spec.
 *
 * Risk levels:
 *   low    — total score < threshold
 *   medium — total score >= threshold but < threshold * 1.5
 *   high   — total score >= threshold * 1.5
 *
 * Decision:
 *   allow  — low risk
 *   warn   — medium risk
 *   block  — high risk
 */

/**
 * @param {object[]} ruleResults  - array of RuleResult from each rule
 * @param {number}   globalThreshold - the threshold to use (from rules table average or config)
 * @returns {{ totalScore, riskLevel, decision, summary }}
 */
function score(ruleResults, globalThreshold = 5.0) {
  const totalScore = ruleResults.reduce((sum, r) => sum + (r.score || 0), 0);

  let riskLevel, decision;

  if (totalScore >= globalThreshold * 1.5) {
    riskLevel = 'high';
    decision  = 'block';
  } else if (totalScore >= globalThreshold) {
    riskLevel = 'medium';
    decision  = 'warn';
  } else {
    riskLevel = 'low';
    decision  = 'allow';
  }

  const matchedRules   = ruleResults.filter((r) => r.matched);
  const allIndicators  = matchedRules.flatMap((r) => r.indicators);
  const allReasons     = matchedRules.flatMap((r) => r.reasons);

  const summary = matchedRules.length === 0
    ? 'No phishing indicators detected.'
    : `${matchedRules.length} phishing indicator(s) detected: ${matchedRules.map((r) => r.rule_name).join(', ')}.`;

  return {
    totalScore,
    riskLevel,
    decision,
    indicators_matched: allIndicators,
    reasons:            allReasons,
    summary,
  };
}

module.exports = { score };
