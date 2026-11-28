'use strict';
/**
 * Express application factory.
 * Returns a configured `app` without binding to a port,
 * so tests can import it without starting a server.
 */

const express       = require('express');
const helmet        = require('helmet');
const path          = require('path');
const session       = require('express-session');
const cookieParser  = require('cookie-parser');
const { v4: uuid }  = require('uuid');

const config                          = require('./config');
const logger                          = require('./config/logger');
const { errorHandler }                = require('./api/errorHandler');
const { ensureCsrfCookie, verifyCsrf} = require('./security/auth/csrf');
const { apiRateLimiter }              = require('./security/auth/rateLimiter');

// Routes
const authRouter        = require('./api/routes/auth');
const adminRouter       = require('./api/routes/admin');
const templatesRouter   = require('./api/routes/templates');
const participantsRouter = require('./api/routes/participants');
const campaignsRouter   = require('./api/routes/campaigns');
const trackRouter       = require('./api/routes/track');
const lessonsRouter     = require('./api/routes/lessons');
const analyticsRouter   = require('./api/routes/analytics');
const reportsRouter     = require('./api/routes/reports');

function createApp() {
  const app = express();

  // ── Security headers ────────────────────────────────────────────────
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc:     ["'self'"],
        scriptSrc:      ["'self'"],
        styleSrc:       ["'self'", "'unsafe-inline'"],
        imgSrc:         ["'self'", 'data:'],
        formAction:     ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
  }));

  // ── Request ID ──────────────────────────────────────────────────────
  app.use((req, _res, next) => {
    req.id = req.headers['x-request-id'] || uuid();
    next();
  });

  // ── Request logging ─────────────────────────────────────────────────
  app.use((req, _res, next) => {
    logger.debug({ method: req.method, path: req.path, requestId: req.id }, 'Incoming request');
    next();
  });

  // ── Body parsing ────────────────────────────────────────────────────
  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: false, limit: '100kb' }));

  // ── Cookie parser (needed before session + CSRF) ────────────────────
  app.use(cookieParser());

  // ── Sessions ────────────────────────────────────────────────────────
  // WHY memorystore:
  //   connect-sqlite3 has a compatibility bug with express-session's
  //   cookie.expires handling. memorystore is a well-maintained
  //   in-memory session store with TTL-based expiry that works
  //   correctly on all platforms. Perfectly suitable for local dev
  //   and demo purposes. Sessions are lost on restart — acceptable
  //   since the spec requires local-only deployment.
  const MemoryStore = require('memorystore')(session);

  app.use(session({
    store: new MemoryStore({
      checkPeriod: config.session.idleMinutes * 60 * 1000,
    }),
    secret:            config.session.secret,
    resave:            false,
    saveUninitialized: false,
    name:              'bc.sid', // non-default name — minor obscurity
    cookie: {
      httpOnly: true,              // JS cannot read the session cookie (TH5)
      sameSite: 'strict',          // blocks cross-site request sending the cookie (TH4)
      secure:   config.env === 'production',
      maxAge:   config.session.idleMinutes * 60 * 1000,
    },
  }));

  // ── Absolute session expiry ─────────────────────────────────────────
  // WHY: maxAge above resets on every request (idle timeout).
  //   We also enforce an absolute maximum so a session cannot live
  //   forever just by staying active (TH5).
  app.use((req, _res, next) => {
    if (!req.session || !req.session.user) return next();
    const created     = req.session.createdAt || 0;
    const absoluteMs  = config.session.absoluteHours * 60 * 60 * 1000;
    if (Date.now() - created > absoluteMs) {
      return req.session.destroy(() =>
        next(require('./api/errorHandler').createError('E_AUTH', 'Session expired. Please log in again.')),
      );
    }
    next();
  });

  // ── CSRF cookie (set on every response) ────────────────────────────
  app.use(ensureCsrfCookie);

  // ── API rate limiting ───────────────────────────────────────────────
  app.use('/api/v1', apiRateLimiter);

  // ── CSRF verification for state-changing API requests ───────────────
    // Public, token-authenticated tracking endpoints (landing form can't send a CSRF header)
  app.use('/api/v1', (req, res, next) =>
    req.path.startsWith('/t/') ? next() : verifyCsrf(req, res, next));

  // ── Static files ────────────────────────────────────────────────────
  app.use(express.static(path.join(__dirname, 'web')));

  // ── Health endpoint (no auth) ────────────────────────────────────────
  app.get('/api/v1/health', (_req, res) => {
    res.json({ status: 'ok', uptime: process.uptime(), env: config.env });
  });

  // ── Auth routes ──────────────────────────────────────────────────────
  app.use('/api/v1/auth',  authRouter);

  // ── Admin routes ─────────────────────────────────────────────────────
  app.use('/api/v1/admin', adminRouter);

  // 25002500 Module routes FR-1 to FR-6 250025002500250025002500250025002500250025002500250025002500250025002500250025002500250025002500250025002500250025002500250025002500250025002500250025002500250025002500250025002500
  app.use('/api/v1/templates',    templatesRouter);
  app.use('/api/v1/participants', participantsRouter);
  app.use('/api/v1/campaigns',    campaignsRouter);
  app.use('/api/v1/t',            trackRouter);
  app.use('/api/v1/lessons',      lessonsRouter);
  app.use('/api/v1/analytics',    analyticsRouter);
  app.use('/api/v1/reports',      reportsRouter);

  // ── 404 handler ──────────────────────────────────────────────────────
  app.use((_req, res) => {
    res.status(404).json({ error: { code: 'E_NOT_FOUND', message: 'Not found.' } });
  });

  // ── Global error handler (must be last) ──────────────────────────────
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
