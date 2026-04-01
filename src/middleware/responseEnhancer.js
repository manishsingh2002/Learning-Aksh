'use strict';

// middleware/responseEnhancer.js
// ============================================================
// RESPONSE ENHANCER
//
// Adds consistent metadata to every JSON response:
//   - requestId     → tracing (from requestId middleware)
//   - timestamp     → ISO response time
//   - responseTime  → ms taken (for monitoring)
//   - version       → API version
//
// Also provides res.success() and res.paginate() helpers
// for controllers to use instead of raw res.status().json().
// ============================================================

const responseEnhancer = (req, res, next) => {
  const startedAt = Date.now();

  // ── OVERRIDE res.json ─────────────────────────────────────
  // Inject standard metadata into every JSON response
  const originalJson = res.json.bind(res);
  res.json = function enhance(body) {
    // Only enhance our own API responses (objects with status field)
    if (body && typeof body === 'object' && 'status' in body) {
      body._meta = {
        requestId:    req.id,
        timestamp:    new Date().toISOString(),
        responseTime: `${Date.now() - startedAt}ms`,
        apiVersion:   process.env.API_VERSION || 'v1'
      };
    }
    return originalJson(body);
  };

  // ── CONVENIENCE HELPERS ───────────────────────────────────
  // Use these in controllers instead of res.status(200).json({...})

  /**
   * Send a success response
   * @param {*}      data
   * @param {number} [statusCode=200]
   * @param {string} [message='success']
   */
  res.success = (data, statusCode = 200, message = 'success') => {
    res.status(statusCode).json({ status: 'success', message, data });
  };

  /**
   * Send a paginated response
   * @param {Array}  data
   * @param {object} pagination
   * @param {string} [message='success']
   */
  res.paginate = (data, pagination, message = 'success') => {
    res.status(200).json({
      status:  'success',
      message,
      results: data.length,
      pagination,
      data
    });
  };

  /**
   * Send a created response (201)
   * @param {*} data
   * @param {string} [message='Created successfully']
   */
  res.created = (data, message = 'Created successfully') => {
    res.status(201).json({ status: 'success', message, data });
  };

  next();
};

module.exports = responseEnhancer;