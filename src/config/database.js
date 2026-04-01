'use strict';

// config/database.js
// ============================================================
// MONGODB CONNECTION
//
// Features:
//   - Connection retry with exponential backoff
//   - Event listeners for connect/disconnect/error
//   - Graceful shutdown hook
//   - Query debug logging in development
// ============================================================

const mongoose = require('mongoose');
const logger   = require('../utils/logger');

const MAX_RETRIES    = 5;
const RETRY_DELAY_MS = 5000;   // 5 seconds between retries

// ── CONNECTION OPTIONS ────────────────────────────────────────
const MONGOOSE_OPTIONS = {
  // Connection pool
  maxPoolSize:     10,
  minPoolSize:     2,
  socketTimeoutMS: 45000,
  serverSelectionTimeoutMS: 10000,

  // Buffering — set false so operations fail fast if disconnected
  bufferCommands: false,

  // Heartbeat
  heartbeatFrequencyMS: 10000,

  // Atlas / replica set
  retryWrites: true,
  w:           'majority'
};

// ── CONNECT WITH RETRY ────────────────────────────────────────
const connectDB = async (attempt = 1) => {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    logger.error('MONGODB_URI is not defined in environment variables.');
    process.exit(1);
  }

  try {
    await mongoose.connect(uri, MONGOOSE_OPTIONS);
    logger.info(`MongoDB connected: ${mongoose.connection.host}`);
    setupListeners();
  } catch (err) {
    logger.error(`MongoDB connection failed (attempt ${attempt}/${MAX_RETRIES})`, {
      error: err.message
    });

    if (attempt < MAX_RETRIES) {
      const delay = RETRY_DELAY_MS * attempt;   // exponential backoff
      logger.info(`Retrying MongoDB connection in ${delay / 1000}s...`);
      await new Promise(r => setTimeout(r, delay));
      return connectDB(attempt + 1);
    }

    logger.error('Max MongoDB connection retries reached. Exiting.');
    process.exit(1);
  }
};

// ── EVENT LISTENERS ───────────────────────────────────────────
const setupListeners = () => {
  mongoose.connection.on('connected', () => {
    logger.info('MongoDB connection established.');
  });

  mongoose.connection.on('disconnected', () => {
    logger.warn('MongoDB disconnected. Attempting to reconnect...');
  });

  mongoose.connection.on('reconnected', () => {
    logger.info('MongoDB reconnected.');
  });

  mongoose.connection.on('error', (err) => {
    logger.error('MongoDB connection error', { error: err.message });
  });

  // Debug mode — log every mongoose query in development
  if (process.env.NODE_ENV === 'development' && process.env.MONGOOSE_DEBUG === 'true') {
    mongoose.set('debug', (collectionName, method, query, doc) => {
      logger.debug(`Mongoose: ${collectionName}.${method}`, { query, doc });
    });
  }
};

// ── GRACEFUL DISCONNECT ───────────────────────────────────────
const disconnectDB = async () => {
  await mongoose.connection.close();
  logger.info('MongoDB connection closed.');
};

module.exports = { connectDB, disconnectDB };