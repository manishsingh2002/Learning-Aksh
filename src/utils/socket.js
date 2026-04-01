'use strict';

// utils/socket.js
// ============================================================
// SOCKET.IO — Real-time features
// Namespaces:
//   /notifications  → per-user alerts, badge awards, announcements
//   /live           → live class chat, viewer count, Q&A queue
//   /exam           → real-time exam timer, submission sync
// ============================================================
// npm install socket.io

const { Server }  = require('socket.io');
const { verifyAccessToken } = require('./token');
const { User }    = require('../models');
const logger      = require('./logger');

let io = null;   // singleton

// ── SOCKET AUTH MIDDLEWARE ───────────────────────────────────
const socketAuthMiddleware = async (socket, next) => {
  try {
    // Accept token from handshake auth or query string
    const token = socket.handshake.auth?.token ||
                  socket.handshake.query?.token;

    if (!token) return next(new Error('Authentication required'));

    const decoded = verifyAccessToken(token);
    const user    = await User.findById(decoded.id)
                              .select('_id firstName lastName role isActive')
                              .lean();

    if (!user || !user.isActive) return next(new Error('User not found or inactive'));

    socket.user = user;   // attach user to socket for downstream use
    next();
  } catch (err) {
    next(new Error(err.message || 'Invalid token'));
  }
};

// ── INIT ─────────────────────────────────────────────────────
const init = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin:      process.env.FRONTEND_URL || 'http://localhost:3000',
      methods:     ['GET', 'POST'],
      credentials: true
    },
    pingTimeout:  20000,
    pingInterval: 10000,
    transports:   ['websocket', 'polling']
  });

  // ── NAMESPACE: /notifications ──────────────────────────────
  // Each user joins their own room: `user:<userId>`
  const notifNS = io.of('/notifications');
  notifNS.use(socketAuthMiddleware);

  notifNS.on('connection', (socket) => {
    const userId = socket.user._id.toString();
    socket.join(`user:${userId}`);
    logger.debug(`Notification socket connected: user ${userId}`);

    socket.on('disconnect', () => {
      logger.debug(`Notification socket disconnected: user ${userId}`);
    });
  });

  // ── NAMESPACE: /live ───────────────────────────────────────
  // Rooms: `class:<liveClassId>`
  const liveNS = io.of('/live');
  liveNS.use(socketAuthMiddleware);

  liveNS.on('connection', (socket) => {
    const userId = socket.user._id.toString();

    // Join a live class room
    socket.on('join-class', async ({ classId }) => {
      if (!classId) return;
      const room = `class:${classId}`;
      socket.join(room);

      // Broadcast updated viewer count to all in room
      const count = (await liveNS.in(room).fetchSockets()).length;
      liveNS.to(room).emit('viewer-count', { count });

      logger.debug(`User ${userId} joined live class ${classId}`);
    });

    // Leave a live class room
    socket.on('leave-class', async ({ classId }) => {
      const room = `class:${classId}`;
      socket.leave(room);
      const count = (await liveNS.in(room).fetchSockets()).length;
      liveNS.to(room).emit('viewer-count', { count });
    });

    // Student sends a chat message
    socket.on('chat-message', ({ classId, message }) => {
      if (!classId || !message?.trim()) return;
      if (message.length > 500) return;  // hard cap

      liveNS.to(`class:${classId}`).emit('chat-message', {
        userId,
        name:      `${socket.user.firstName} ${socket.user.lastName}`,
        role:      socket.user.role,
        message:   message.trim(),
        timestamp: new Date().toISOString()
      });
    });

    // Student raises a question for the Q&A queue
    socket.on('raise-question', ({ classId, question }) => {
      if (!classId || !question?.trim()) return;
      liveNS.to(`class:${classId}`).emit('new-question', {
        userId,
        name:      `${socket.user.firstName} ${socket.user.lastName}`,
        question:  question.trim(),
        timestamp: new Date().toISOString(),
        upvotes:   0
      });
    });

    // Instructor controls: start/pause/end class
    socket.on('class-control', ({ classId, action }) => {
      if (!['instructor', 'admin'].includes(socket.user.role)) return;
      liveNS.to(`class:${classId}`).emit('class-control', { action, by: userId });
    });

    socket.on('disconnect', async () => {
      // Update viewer counts for all rooms this socket was in
      const rooms = [...socket.rooms].filter(r => r.startsWith('class:'));
      for (const room of rooms) {
        const count = (await liveNS.in(room).fetchSockets()).length;
        liveNS.to(room).emit('viewer-count', { count });
      }
    });
  });

  // ── NAMESPACE: /exam ────────────────────────────────────────
  // Rooms: `exam:<mockTestId>:<studentId>`  (private per attempt)
  const examNS = io.of('/exam');
  examNS.use(socketAuthMiddleware);

  examNS.on('connection', (socket) => {
    const userId = socket.user._id.toString();

    // Student starts / resumes an exam
    socket.on('start-exam', ({ attemptId }) => {
      if (!attemptId) return;
      socket.join(`attempt:${attemptId}`);
      logger.debug(`User ${userId} started exam attempt ${attemptId}`);
    });

    // Heartbeat — client sends every 30s to confirm still active
    // Useful for detecting tab switches / abandonment
    socket.on('exam-heartbeat', ({ attemptId, timeLeft }) => {
      if (!attemptId) return;
      // Could update attempt.lastActive in DB via queue
      socket.emit('heartbeat-ack', { timeLeft });
    });

    // Time warning — server pushes to client (called from scheduler)
    // (see scheduler.js)

    socket.on('disconnect', () => {
      logger.debug(`Exam socket disconnected: user ${userId}`);
    });
  });

  logger.info('Socket.IO initialized with namespaces: /notifications, /live, /exam');
  return io;
};

// ── EMITTER HELPERS ──────────────────────────────────────────
// Used by controllers/services to push real-time events

/**
 * Send a notification to a specific user
 */
const notifyUser = (userId, event, data) => {
  if (!io) return;
  io.of('/notifications').to(`user:${userId}`).emit(event, data);
};

/**
 * Send a notification to multiple users
 */
const notifyUsers = (userIds, event, data) => {
  if (!io) return;
  userIds.forEach(id => notifyUser(id, event, data));
};

/**
 * Broadcast to all students in a live class
 */
const broadcastToClass = (classId, event, data) => {
  if (!io) return;
  io.of('/live').to(`class:${classId}`).emit(event, data);
};

/**
 * Push timer warning to an exam attempt room
 */
const pushExamWarning = (attemptId, timeLeftSeconds) => {
  if (!io) return;
  io.of('/exam').to(`attempt:${attemptId}`).emit('time-warning', { timeLeftSeconds });
};

/**
 * Force-submit an exam when time runs out
 */
const forceSubmitExam = (attemptId) => {
  if (!io) return;
  io.of('/exam').to(`attempt:${attemptId}`).emit('force-submit', {
    reason: 'time_expired',
    message: 'Time is up! Your exam has been submitted automatically.'
  });
};

const getIO = () => io;

// ── EXPORTS ──────────────────────────────────────────────────
module.exports = {
  init,
  getIO,
  notifyUser,
  notifyUsers,
  broadcastToClass,
  pushExamWarning,
  forceSubmitExam
};