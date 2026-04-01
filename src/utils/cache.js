'use strict';

// utils/cache.js
// ============================================================
// REDIS CACHE — Wrapper around ioredis
// Gracefully degrades if Redis is unavailable.
// ============================================================
// npm install ioredis

const logger = require('./logger');

let client = null;
let isReady = false;

// ── CONNECT ──────────────────────────────────────────────────
const connect = () => {
  if (!process.env.REDIS_URL) {
    logger.warn('REDIS_URL not set — cache disabled, running without Redis');
    return;
  }

  try {
    const Redis = require('ioredis');
    client = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      connectTimeout:       5000,
      lazyConnect:          true,
      enableOfflineQueue:   false    // don't queue commands when disconnected
    });

    client.on('connect', () => { isReady = true;  logger.info('Redis connected'); });
    client.on('error',   (err) => { isReady = false; logger.error('Redis error', { error: err.message }); });
    client.on('close',   () => { isReady = false; });

    client.connect().catch(() => {});
  } catch {
    logger.warn('ioredis not installed — cache disabled');
  }
};

// ── KEY BUILDERS ─────────────────────────────────────────────
// Consistent key naming prevents collisions
const keys = {
  user:            (id)           => `user:${id}`,
  course:          (id)           => `course:${id}`,
  batch:           (id)           => `batch:${id}`,
  examGoal:        (id)           => `examgoal:${id}`,
  mockTest:        (id)           => `mocktest:${id}`,
  liveClasses:     (batchId)      => `liveclasses:batch:${batchId}`,
  leaderboard:     (mockTestId)   => `leaderboard:${mockTestId}`,
  analytics:       (studentId, examGoalId) => `analytics:${studentId}:${examGoalId}`,
  dailyPractice:   (examGoalId, date) => `dpq:${examGoalId}:${date}`,
  systemSettings:  ()             => `system:settings`,
  masterData:      (type)         => `master:${type}`,
  enrollmentCheck: (studentId, resourceId) => `enrolled:${studentId}:${resourceId}`
};

// ── CORE OPERATIONS ──────────────────────────────────────────

/**
 * Get a cached value. Returns null if cache miss or Redis unavailable.
 */
const get = async (key) => {
  if (!isReady || !client) return null;
  try {
    const value = await client.get(key);
    return value ? JSON.parse(value) : null;
  } catch (err) {
    logger.warn('Cache GET failed', { key, error: err.message });
    return null;
  }
};

/**
 * Set a cached value with optional TTL in seconds
 * @param {string} key
 * @param {*}      value
 * @param {number} [ttl=300] - seconds (default 5 min)
 */
const set = async (key, value, ttl = 300) => {
  if (!isReady || !client) return false;
  try {
    await client.setex(key, ttl, JSON.stringify(value));
    return true;
  } catch (err) {
    logger.warn('Cache SET failed', { key, error: err.message });
    return false;
  }
};

/**
 * Delete one or more cached keys
 */
const del = async (...keyList) => {
  if (!isReady || !client) return;
  try {
    await client.del(...keyList);
  } catch (err) {
    logger.warn('Cache DEL failed', { keys: keyList, error: err.message });
  }
};

/**
 * Delete all keys matching a pattern (use with care in prod)
 * @param {string} pattern - e.g. 'course:*'
 */
const delPattern = async (pattern) => {
  if (!isReady || !client) return;
  try {
    const found = await client.keys(pattern);
    if (found.length > 0) await client.del(...found);
  } catch (err) {
    logger.warn('Cache DELPATTERN failed', { pattern, error: err.message });
  }
};

// ── CACHE-ASIDE HELPER ───────────────────────────────────────
/**
 * Read-through cache: check cache first, fetch from DB if miss, then cache result.
 * @param {string}   key
 * @param {Function} fetchFn  - async function that returns the value
 * @param {number}   [ttl]
 */
const remember = async (key, fetchFn, ttl = 300) => {
  const cached = await get(key);
  if (cached !== null) return cached;

  const value = await fetchFn();
  if (value !== null && value !== undefined) {
    await set(key, value, ttl);
  }
  return value;
};

// ── TTL CONSTANTS ────────────────────────────────────────────
// Centralised so you can tune them in one place
const TTL = {
  SHORT:    60,          // 1 min  — live data (leaderboards, active students)
  MEDIUM:   300,         // 5 min  — course details, batch info
  LONG:     1800,        // 30 min — exam goals, categories, master data
  DAY:      86400,       // 24 hrs — rarely changing data (system settings)
  WEEK:     604800       // 7 days — static content (question banks)
};

// ── EXPORTS ──────────────────────────────────────────────────
module.exports = { connect, get, set, del, delPattern, remember, keys, TTL };