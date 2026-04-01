'use strict';

// utils/logger.js
// ============================================================
// STRUCTURED LOGGER — Winston
// - Development : colorized console output
// - Production  : JSON to files + console (ready for log aggregators)
// - HTTP        : Morgan stream integration
// ============================================================
// npm install winston winston-daily-rotate-file

const { createLogger, format, transports } = require('winston');
require('winston-daily-rotate-file');
const path = require('path');

const { combine, timestamp, printf, colorize, errors, json, splat } = format;

const isDev  = process.env.NODE_ENV === 'development';
const logDir = path.join(process.cwd(), 'logs');

// ── FORMATS ─────────────────────────────────────────────────

// Pretty format for development console
const devFormat = combine(
  colorize({ all: true }),
  timestamp({ format: 'HH:mm:ss' }),
  errors({ stack: true }),
  splat(),
  printf(({ level, message, timestamp, stack, ...meta }) => {
    const metaStr = Object.keys(meta).length ? `\n${JSON.stringify(meta, null, 2)}` : '';
    return `${timestamp} [${level}]: ${stack || message}${metaStr}`;
  })
);

// JSON format for production (Datadog, CloudWatch, Loki-ready)
const prodFormat = combine(
  timestamp(),
  errors({ stack: true }),
  splat(),
  json()
);

// ── TRANSPORTS ──────────────────────────────────────────────

const consoleTransport = new transports.Console({
  format: isDev ? devFormat : prodFormat,
  silent: process.env.NODE_ENV === 'test'
});

// Rotating file — error logs (production only)
const errorFileTransport = new transports.DailyRotateFile({
  filename:    path.join(logDir, 'error-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  level:       'error',
  maxFiles:    '30d',
  maxSize:     '20m',
  format:      prodFormat,
  silent:      isDev
});

// Rotating file — combined logs (production only)
const combinedFileTransport = new transports.DailyRotateFile({
  filename:    path.join(logDir, 'combined-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxFiles:    '14d',
  maxSize:     '50m',
  format:      prodFormat,
  silent:      isDev
});

// ── LOGGER INSTANCE ─────────────────────────────────────────

const logger = createLogger({
  level:          isDev ? 'debug' : 'info',
  defaultMeta:    { service: process.env.APP_NAME || 'exam-prep-api' },
  transports:     [consoleTransport, errorFileTransport, combinedFileTransport],
  exceptionHandlers: [
    new transports.DailyRotateFile({
      filename:    path.join(logDir, 'exceptions-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxFiles:    '30d',
      format:      prodFormat,
      silent:      isDev
    })
  ],
  rejectionHandlers: [
    new transports.DailyRotateFile({
      filename:    path.join(logDir, 'rejections-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxFiles:    '30d',
      format:      prodFormat,
      silent:      isDev
    })
  ]
});

// ── MORGAN STREAM ────────────────────────────────────────────
// Use in app.js: app.use(morgan('combined', { stream: logger.stream }))
logger.stream = {
  write: (message) => logger.http(message.trim())
};

// ── CONTEXT LOGGER ───────────────────────────────────────────
// Creates a child logger with request context (userId, requestId)
// Usage: const log = logger.child({ userId, requestId });
//        log.info('Course created', { courseId });
logger.createRequestLogger = (req) => {
  return logger.child({
    requestId: req.id || req.headers['x-request-id'],
    userId:    req.user?._id,
    ip:        req.ip,
    method:    req.method,
    path:      req.path
  });
};

module.exports = logger;