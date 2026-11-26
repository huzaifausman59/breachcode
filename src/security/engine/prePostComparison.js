'use strict';
/**
 * Pre/Post Comparison Engine
 *
 * Compares event rates between a pre-training campaign and a
 * post-training campaign. Returns deltas and a plain-language
 * interpretation including sample size caveats.
 *
 * Satisfies FR-6 (pre/post analytics with explainable evidence).
 *
 * WHY include sample size warnings:
 *   The spec requires honest reporting. Small sample sizes make
 *   percentage changes misleading (e.g. 1 person clicking = 100%
 *   click rate in a 1-person campaign). We surface this explicitly.
 */

const MIN_RELIABLE_SAMPLE = 10; // below this, results are flagged as low-confidence

/**
 * Calculate rate safely (avoid division by zero).
 */
function rate(count, total) {
  if (!total || total === 0) return 0;
  return Math.round((count / total) * 10000) / 100; // percentage, 2 decimal places
}

/**
 * Interpret delta direction.
 */
function interpret(metricName, delta, postRate) {
  if (metricName === 'report_rate') {
    // Higher report rate after training = improvement.
    if (delta > 0)  return `${metricName} improved by ${delta.toFixed(1)}pp — more participants are correctly identifying phishing.`;
    if (delta < 0)  return `${metricName} declined by ${Math.abs(delta).toFixed(1)}pp.`;
    return `${metricName} unchanged.`;
  }
  // For click/submit rates, lower = better.
  if (delta < 0)  return `${metricName} decreased by ${Math.abs(delta).toFixed(1)}pp — training is working.`;
  if (delta > 0)  return `${metricName} increased by ${delta.toFixed(1)}pp — further training may be needed.`;
  return `${metricName} unchanged at ${postRate}%.`;
}

/**
 * Compare pre and post campaign event summaries.
 *
 * @param {object} pre  - { total_sent, opened, clicked, submitted, reported }
 * @param {object} post - { total_sent, opened, clicked, submitted, reported }
 * @returns {object} comparison result
 */
function compare(pre, post) {
  const metrics = ['click_rate', 'submit_rate', 'report_rate'];

  const preRates = {
    click_rate:  rate(pre.clicked   || 0, pre.total_sent),
    submit_rate: rate(pre.submitted || 0, pre.total_sent),
    report_rate: rate(pre.reported  || 0, pre.total_sent),
  };

  const postRates = {
    click_rate:  rate(post.clicked   || 0, post.total_sent),
    submit_rate: rate(post.submitted || 0, post.total_sent),
    report_rate: rate(post.reported  || 0, post.total_sent),
  };

  const deltas = {};
  const interpretations = [];

  for (const m of metrics) {
    const delta = Math.round((postRates[m] - preRates[m]) * 100) / 100;
    deltas[m]   = delta;
    interpretations.push(interpret(m, delta, postRates[m]));
  }

  // Sample size warnings.
  const warnings = [];
  if (pre.total_sent  < MIN_RELIABLE_SAMPLE) warnings.push(`Pre-training sample size (${pre.total_sent}) is below ${MIN_RELIABLE_SAMPLE} — results may not be statistically reliable.`);
  if (post.total_sent < MIN_RELIABLE_SAMPLE) warnings.push(`Post-training sample size (${post.total_sent}) is below ${MIN_RELIABLE_SAMPLE} — results may not be statistically reliable.`);

  // Overall improvement score: average reduction in click+submit rate + increase in report rate.
  const improvementScore = Math.round(
    ((-deltas.click_rate) + (-deltas.submit_rate) + deltas.report_rate) / 3 * 100,
  ) / 100;

  return {
    pre:              { ...preRates,  total_sent: pre.total_sent },
    post:             { ...postRates, total_sent: post.total_sent },
    deltas,
    interpretations,
    improvementScore,
    improved:         improvementScore > 0,
    warnings,
    sample_size_note: warnings.length > 0
      ? 'Low sample size — interpret results with caution.'
      : 'Sample size is adequate for basic comparison.',
  };
}

module.exports = { compare, rate };
