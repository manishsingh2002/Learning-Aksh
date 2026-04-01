'use strict';

// server.js
// ============================================================
// SERVER ENTRY POINT
//
// Responsibilities:
//   1. Load + validate environment variables
//   2. Connect to MongoDB (with retry)
//   3. Start Express HTTP server
//   4. Attach Socket.IO to HTTP server
//   5. Connect Redis cache
//   6. Start cron scheduler
//   7. Handle graceful shutdown (SIGTERM / SIGINT)
//   8. Handle uncaught exceptions / rejections
//
// This file is the only place where process.exit() is called.
// app.js stays clean — it only knows about Express.
// ============================================================

// ── LOAD ENV FIRST — before anything else ────────────────────
require('dotenv').config();

const { validateEnv, applyDefaults } = require('./config/env');
applyDefaults();   // set safe defaults for optional vars
validateEnv();     // exit immediately if required vars missing

// ── IMPORTS (after env is validated) ─────────────────────────
const http      = require('http');
const app       = require('./app');
const logger    = require('./utils/logger');
const { connectDB, disconnectDB } = require('./config/database');
const socket    = require('./utils/socket');
const cache     = require('./utils/cache');
const scheduler = require('./utils/scheduler');

// ── CONSTANTS ────────────────────────────────────────────────
const PORT    = parseInt(process.env.PORT, 10) || 5000;
const HOST    = process.env.HOST || '0.0.0.0';
const NODE_ENV = process.env.NODE_ENV || 'development';

// ── CREATE HTTP SERVER ────────────────────────────────────────
// We use http.createServer so Socket.IO and Express
// share the same port — no separate WebSocket port needed.
const server = http.createServer(app);

// ── CONFIGURE SERVER TIMEOUTS ────────────────────────────────
// Prevent slow clients from holding connections open forever.
// These must be longer than your reverse proxy's timeout.
server.keepAliveTimeout = 65000;   // slightly > ALB's 60s
server.headersTimeout   = 66000;   // slightly > keepAliveTimeout

// ────────────────────────────────────────────────────────────
// STARTUP SEQUENCE
// ────────────────────────────────────────────────────────────
const start = async () => {
  try {
    // ── 1. Connect MongoDB ───────────────────────────────────
    logger.info('Connecting to MongoDB...');
    await connectDB();

    // ── 2. Connect Redis cache ───────────────────────────────
    // Gracefully degrades if Redis is unavailable —
    // cache.connect() only warns, never throws.
    logger.info('Connecting to Redis...');
    cache.connect();

    // ── 3. Start HTTP server ─────────────────────────────────
    await new Promise((resolve, reject) => {
      server.listen(PORT, HOST, resolve);
      server.once('error', reject);
    });

    const addr    = server.address();
    const baseUrl = `http://${addr.address}:${addr.port}`;

    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    logger.info(`  ${process.env.APP_NAME || 'ExamPrep API'} is running`);
    logger.info(`  Environment : ${NODE_ENV}`);
    logger.info(`  Server      : ${baseUrl}`);
    logger.info(`  API Base    : ${baseUrl}/api/v1`);
    logger.info(`  Health      : ${baseUrl}/health`);
    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // ── 4. Attach Socket.IO ──────────────────────────────────
    // Must be after server.listen() so the HTTP server exists
    logger.info('Initializing Socket.IO...');
    socket.init(server);

    // ── 5. Start cron scheduler ──────────────────────────────
    logger.info('Starting cron scheduler...');
    scheduler.init();

    logger.info('All services started successfully. Ready to accept connections.');

  } catch (err) {
    logger.error('Fatal error during server startup', {
      error:   err.message,
      stack:   err.stack
    });
    process.exit(1);
  }
};

// ────────────────────────────────────────────────────────────
// GRACEFUL SHUTDOWN
// ────────────────────────────────────────────────────────────
// On shutdown signals:
//   1. Stop accepting new connections
//   2. Let in-flight requests finish (30s timeout)
//   3. Stop cron jobs
//   4. Close DB + Redis connections
//   5. Exit cleanly

let isShuttingDown = false;

const shutdown = async (signal) => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info(`${signal} received — starting graceful shutdown...`);

  // ── Stop accepting new connections ────────────────────────
  server.close(async () => {
    logger.info('HTTP server closed. No new connections accepted.');

    try {
      // ── Stop cron jobs ────────────────────────────────────
      scheduler.stop();
      logger.info('Cron scheduler stopped.');

      // ── Close MongoDB ─────────────────────────────────────
      await disconnectDB();
      logger.info('MongoDB connection closed.');

      logger.info('Graceful shutdown complete. Goodbye. 👋');
      process.exit(0);

    } catch (err) {
      logger.error('Error during shutdown cleanup', { error: err.message });
      process.exit(1);
    }
  });

  // Force exit after 30 seconds if requests haven't finished
  setTimeout(() => {
    logger.error('Forced shutdown after 30s timeout — some requests may have been lost.');
    process.exit(1);
  }, 30000).unref();   // .unref() prevents timer from keeping process alive
};

// ── PROCESS SIGNAL HANDLERS ───────────────────────────────────
// SIGTERM — sent by process managers (PM2, Docker, Kubernetes)
process.on('SIGTERM', () => shutdown('SIGTERM'));

// SIGINT — sent by Ctrl+C in terminal
process.on('SIGINT',  () => shutdown('SIGINT'));

// ── UNHANDLED ERRORS ──────────────────────────────────────────
// Uncaught exceptions — programming errors, should never happen
// Log + restart. Do NOT try to recover — state may be corrupt.
process.on('uncaughtException', (err) => {
  logger.error('UNCAUGHT EXCEPTION — shutting down', {
    error: err.message,
    stack: err.stack
  });
  // Give logger time to flush before exiting
  setTimeout(() => process.exit(1), 1000);
});

// Unhandled promise rejections — missing .catch() somewhere
process.on('unhandledRejection', (reason, promise) => {
  logger.error('UNHANDLED REJECTION — shutting down', {
    reason: reason?.message || reason,
    stack:  reason?.stack
  });
  server.close(() => process.exit(1));
});

// Memory warning (Node.js 16.14+)
process.on('warning', (warning) => {
  logger.warn('Node.js process warning', {
    name:    warning.name,
    message: warning.message,
    stack:   warning.stack
  });
});

// ── START ─────────────────────────────────────────────────────
start();