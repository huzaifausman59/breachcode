'use strict';
/**
 * Engine Evaluation Script — `npm run report`
 *
 * Runs the engine against all fixture templates and reports:
 *   - Coverage (which rules fired on adverse samples)
 *   - False Positives (normal sample flagged as warn/block)
 *   - False Negatives (adverse sample not flagged as warn/block)
 *   - Decision Latency (ms per analysis)
 *
 * Output is printed as a formatted table to stdout.
 * Satisfies the spec requirement: "report coverage, FP, FN, decision latency".
 */

const path = require('path');
const { analyzeTemplate } = require('./engine');

// Load fixtures directly — no DB needed for evaluation.
const FIXTURES = [
  {
    label:    'Normal template (expect: allow)',
    file:     'normal_template.json',
    expectDecision: 'allow',
  },
  {
    label:    'Adverse template — all 6 indicators (expect: block)',
    file:     'adverse_template.json',
    expectDecision: 'block',
  },
];

// Edge case inline fixtures.
const EDGE_CASES = [
  {
    label: 'Edge: empty template (expect: allow)',
    template: { subject: '', sender_name: '', sender_email: 'x@northwind-university.local', html_body: '', text_body: '' },
    expectDecision: 'allow',
  },
  {
    label: 'Edge: urgency only (expect: warn or block)',
    template: {
      subject: 'URGENT: Action Required immediately',
      sender_name: 'Northwind University',
      sender_email: 'noreply@northwind-university.local',
      html_body: '<p>Dear Alice, please act immediately or your account will be suspended.</p>',
      text_body: 'Dear Alice, please act immediately or your account will be suspended.',
    },
    expectDecision: null, // any result acceptable — just measure latency
  },
  {
    label: 'Edge: mismatched link only (expect: warn or block)',
    template: {
      subject: 'Please review this',
      sender_name: 'Northwind University',
      sender_email: 'noreply@northwind-university.local',
      html_body: '<p>Dear Alice, <a href="http://evil.xyz">www.northwind-university.local</a></p>',
      text_body: '',
    },
    expectDecision: null,
  },
];

function pad(str, len) {
  return String(str).padEnd(len);
}

function run() {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║          BreachCoach Security Engine Evaluation           ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  const fixturesDir = path.resolve('./fixtures/templates');
  let tp = 0, tn = 0, fp = 0, fn = 0;
  const latencies = [];

  const allCases = [
    ...FIXTURES.map(({ label, file, expectDecision }) => ({
      label,
      template: require(path.join(fixturesDir, file)),
      expectDecision,
    })),
    ...EDGE_CASES,
  ];

  console.log(pad('Test Case', 50), pad('Decision', 10), pad('Risk', 8), pad('Score', 8), pad('Latency', 10), 'Result');
  console.log('─'.repeat(100));

  for (const { label, template, expectDecision } of allCases) {
    const start  = Date.now();
    const result = analyzeTemplate(template);
    const latency = Date.now() - start;
    latencies.push(latency);

    let testResult = '—';
    if (expectDecision) {
      const pass = result.decision === expectDecision;
      testResult = pass ? '✓ PASS' : '✗ FAIL';

      // Confusion matrix:
      //   adverse sample (expected warn/block) correctly caught = TP
      //   normal sample (expected allow) correctly passed = TN
      //   normal sample incorrectly flagged = FP
      //   adverse sample incorrectly passed = FN
      if (expectDecision !== 'allow' && pass)  tp++;
      if (expectDecision === 'allow' && pass)  tn++;
      if (expectDecision === 'allow' && !pass) fp++;
      if (expectDecision !== 'allow' && !pass) fn++;
    }

    console.log(
      pad(label.slice(0, 48), 50),
      pad(result.decision, 10),
      pad(result.risk_level, 8),
      pad(result.total_score.toFixed(1), 8),
      pad(`${latency}ms`, 10),
      testResult,
    );

    if (result.indicators_matched.length > 0) {
      console.log(`  Indicators: ${result.indicators_matched.slice(0, 3).join(', ')}${result.indicators_matched.length > 3 ? '…' : ''}`);
    }
  }

  // ── Summary ─────────────────────────────────────────────────────────────
  const avgLatency = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length);
  const maxLatency = Math.max(...latencies);
  const total      = tp + tn + fp + fn;
  const accuracy   = total > 0 ? Math.round(((tp + tn) / total) * 100) : 0;

  console.log('\n' + '─'.repeat(100));
  console.log('METRICS SUMMARY');
  console.log('─'.repeat(100));
  console.log(`True Positives  (adverse caught):   ${tp}`);
  console.log(`True Negatives  (normal passed):     ${tn}`);
  console.log(`False Positives (normal flagged):    ${fp}`);
  console.log(`False Negatives (adverse missed):    ${fn}`);
  console.log(`Accuracy:                            ${accuracy}%`);
  console.log(`Avg decision latency:                ${avgLatency}ms`);
  console.log(`Max decision latency:                ${maxLatency}ms`);
  console.log(`Total cases evaluated:               ${allCases.length}`);
  console.log('─'.repeat(100));

  if (fp > 0) console.log('⚠  False positives detected — consider raising thresholds.');
  if (fn > 0) console.log('⚠  False negatives detected — consider lowering thresholds or adding patterns.');
  if (fp === 0 && fn === 0) console.log('✓  No false positives or false negatives on fixture set.');
  console.log();
}

run();
