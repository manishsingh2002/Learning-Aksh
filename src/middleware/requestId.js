'use strict';

// middleware/requestId.js
// ============================================================
// REQUEST ID — Attaches a unique ID to every incoming request.
// Used for distributed tracing, log correlation, and support.
//
// Priority order:
//   1. x-request-id header (if client/API gateway sends one)
//   2. Auto-generated UUID v4
//
// Sets both req.id and X-Request-ID response header so
// clients can correlate their request with server logs.
// ============================================================

const { randomUUID } = require('crypto');

const requestId = (req, res, next) => {
  // Honour forwarded request ID from API gateway / load balancer
  const incomingId = req.headers['x-request-id'];
  const id = (incomingId && /^[\w\-]{8,64}$/.test(incomingId))
    ? incomingId
    : randomUUID();

  req.id = id;
  res.setHeader('X-Request-ID', id);
  next();
};

module.exports = requestId;