'use strict';
/**
 * Express application factory.
 * Returns a configured `app` without binding to a port,
 * so tests can import it without starting a server.
 */

const express      = require('express');
const helmet       = require('helmet');
const path         = require('path');
const { v4: uuid } = require('uuid');

const config             = require('./config');
const logger             = require('./config/logger');
const { errorHandler }   = require('./api/errorHandler');

function createApp() {
  const app = express();

  // ── Security headers (helmet) ────────────────────────────────────────
  // WHY helmet: sets X-Frame-Options, X-Content-Type-Options,
  //   Strict-Transport-Security, etc. in a single call.
  //   CSP is configured explicitly to allow only what we need.
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc:  ["'self'"],
        styleSrc:   ["'self'", "'unsafe-inline'"], // inline styles for landing page banner
        imgSrc:     ["'self'", 'data:'],            // data: for 1×1 tracking pixel
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
  }));

  // ── Request ID (for log correlation) ────────────────────────────────
  app.use((req, _res, next) => {
    req.id = req.headers['x-request-id'] || uuid();
    next();
  });

  // ── Request logging ────────────────────────────────────────────────
  app.use((req, _res, next) => {
    logger.debug({ method: req.method, path: req.path, requestId: req.id }, 'Incoming request');
    next();
  });

  // ── Body parsing ──────────────────────────────────────────────────
  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: false, limit: '100kb' }));

  // ── Static files ─────────────────────────────────────────────────
  app.use(express.static(path.join(__dirname, 'web')));

  // ── Health endpoint (no auth) ────────────────────────────────────
  app.get('/api/v1/health', (_req, res) => {
    res.json({ status: 'ok', uptime: process.uptime(), env: config.env });
  });

  // ── API routes (Phase 2+) ────────────────────────────────────────
  // Routes are registered here as each phase adds them.
  // Placeholder — avoids 404 on /api/v1 during Phase 1 testing.
  app.use('/api/v1', (_req, res, next) => {
    // Routes registered in later phases will override this.
    next();
  });

  // ── 404 handler ────────────────────────────────────────────────
  app.use((_req, res) => {
    res.status(404).json({ error: { code: 'E_NOT_FOUND', message: 'Not found.' } });
  });

  // ── Global error handler (must be last) ─────────────────────────
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
