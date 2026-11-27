'use strict';
const router  = require('express').Router();
const multer  = require('multer');
const { parse } = require('csv-parse/sync');
const { requireAuth, requireRole, ROLES } = require('../../security/auth/rbac');
const { createError }   = require('../errorHandler');
const { appendAudit }   = require('../../security/audit/log');
const participantRepo   = require('../../repo/participantRepo');
const config            = require('../../config');

// Memory storage — file never touches disk (TH2).
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: config.upload.maxBytes },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(createError('E_FILE', 'Only CSV files are accepted.'));
    }
  },
});

router.use(requireAuth, requireRole(ROLES.OPERATOR));

// Formula-injection prefixes — reject any cell starting with these (TH2).
const FORMULA_PREFIXES = ['=', '+', '-', '@', '\t', '\r'];
function isSafeCell(val) {
  if (!val) return true;
  return !FORMULA_PREFIXES.some((p) => String(val).startsWith(p));
}

// ── GET /participants ────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const participants = participantRepo.listParticipants();
  res.json({ participants });
});

// ── GET /participants/:id ────────────────────────────────────────────────────
router.get('/:id', (req, res, next) => {
  const p = participantRepo.findById(req.params.id);
  if (!p) return next(createError('E_NOT_FOUND', 'Participant not found.'));
  res.json({ participant: p });
});

// ── POST /participants/import ────────────────────────────────────────────────
router.post('/import', upload.single('file'), async (req, res, next) => {
  if (!req.file) return next(createError('E_FILE', 'No CSV file uploaded.'));

  // confirm required for bulk import (high-impact action).
  const body = req.body || {};
  if (body.confirm !== 'true' && body.confirm !== true) {
    return next(createError('E_CONFIRM', 'Bulk import requires confirm=true.'));
  }

  let rows;
  try {
    rows = parse(req.file.buffer.toString('utf8'), {
      columns:          true,
      skip_empty_lines: true,
      trim:             true,
      relax_quotes:     true,   // allow =CMD("x") so formula rows are skipped per-row, not whole-file
    });
  } catch (err) {
    return next(createError('E_FILE', 'CSV parse error: ' + err.message));
  }

  const required = ['email', 'consent_at', 'consent_source'];
  const results  = { imported: 0, skipped: 0, errors: [] };

  for (let i = 0; i < rows.length; i++) {
    const row     = rows[i];
    const rowNum  = i + 2; // 1-indexed + header row

    // Formula injection check on all cells (TH2).
    const hasFormula = Object.values(row).some((v) => !isSafeCell(v));
    if (hasFormula) {
      results.errors.push({ row: rowNum, error: 'Formula prefix detected — row rejected (security policy).' });
      results.skipped++;
      continue;
    }

    // Required field check.
    const missing = required.filter((f) => !row[f] || !row[f].trim());
    if (missing.length) {
      results.errors.push({ row: rowNum, error: `Missing required fields: ${missing.join(', ')}` });
      results.skipped++;
      continue;
    }

    // Basic email format.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) {
      results.errors.push({ row: rowNum, error: `Invalid email: "${row.email}"` });
      results.skipped++;
      continue;
    }

    // consent_at must be a valid ISO date.
    if (isNaN(Date.parse(row.consent_at))) {
      results.errors.push({ row: rowNum, error: `Invalid consent_at date: "${row.consent_at}"` });
      results.skipped++;
      continue;
    }

    try {
      participantRepo.upsertParticipant({
        email:          row.email.toLowerCase().trim(),
        display_name:   row.display_name || null,
        consent_at:     new Date(row.consent_at).toISOString(),
        consent_source: 'csv_import',
      });
      results.imported++;
    } catch (err) {
      results.errors.push({ row: rowNum, error: err.message });
      results.skipped++;
    }
  }

  await appendAudit({
    actorId: req.session.user.id, actorRole: req.session.user.role,
    action: 'participant.import', targetType: 'participant', targetId: null,
    outcome: results.imported > 0 ? 'success' : 'failure',
    detail: { imported: results.imported, skipped: results.skipped, total: rows.length },
    requestId: req.id, ip: req.ip,
  });

  res.json({ message: `Imported ${results.imported} participant(s).`, ...results });
});

// ── DELETE /participants/:id (admin only) ────────────────────────────────────
router.delete('/:id', requireRole(ROLES.ADMIN), async (req, res, next) => {
  const p = participantRepo.findById(req.params.id);
  if (!p) return next(createError('E_NOT_FOUND', 'Participant not found.'));
  participantRepo.deleteParticipant(req.params.id);
  await appendAudit({
    actorId: req.session.user.id, actorRole: req.session.user.role,
    action: 'participant.delete', targetType: 'participant', targetId: req.params.id,
    outcome: 'success', requestId: req.id, ip: req.ip,
  });
  res.json({ message: 'Participant removed.' });
});

module.exports = router;
