'use strict';
/**
 * Entry point — `npm start` / `npm run dev`.
 * Loads environment, runs migrations, starts the HTTP server.
 */

// Load .env before any config module runs.
try { require('dotenv').config(); } catch (_) { /* dotenv is optional in prod */ }

const config  = require('./config');
const logger  = require('./config/logger');
const { migrate } = require('./repo/migrate');
const { createApp }  = require('./app');

async function main() {
  // Fail fast if DB setup fails.
  migrate();

  const app = createApp();

  const server = app.listen(config.port, () => {
    logger.info(
      { port: config.port, env: config.env, org: config.app.orgName },
      'BreachCoach server started',
    );
  });

  // Graceful shutdown on SIGTERM/SIGINT (e.g. Ctrl-C in dev, container stop).
  const shutdown = (signal) => {
    logger.info({ signal }, 'Shutting down gracefully…');
    server.close(() => {
      logger.info('HTTP server closed');
      process.exit(0);
    });
    // Force exit after 10 s if connections don't drain.
    setTimeout(() => process.exit(1), 10_000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));

  // Log unhandled rejections — never swallow them silently.
  process.on('unhandledRejection', (reason) => {
    logger.fatal({ reason }, 'Unhandled promise rejection');
    process.exit(1);
  });
}

main().catch((err) => {
  // This catches config validation failures (missing env vars).
  console.error('Fatal startup error:', err.message);
  process.exit(1);
});
