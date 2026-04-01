'use strict';

// middleware/activityTracker.js
// ============================================================
// ACTIVITY TRACKER — Streak & engagement tracking
//
// Fires on authenticated GET and POST requests to record
// user study activity for:
//   - Daily streak calculation (scheduler reads ActivityLog)
//   - Admin analytics dashboard
//   - Weekly digest emails
//
// Always non-blocking (fire-and-forget).
// Only tracks meaningful learning events, not every API hit.
// ============================================================

const logger = require('../utils/logger');

// Only track these meaningful activity types based on path + method
const TRACK_MAP = [
  { pattern: /\/lessons\/.*\/complete/,  method: 'PATCH',  type: 'lesson_complete'      },
  { pattern: /\/attempts\/.*\/submit/,   method: 'POST',   type: 'mock_test_attempt'    },
  { pattern: /\/daily-practice\/.*\/submit/, method: 'POST', type: 'dpq_attempt'        },
  { pattern: /\/live-classes\/.*\/join/, method: 'POST',   type: 'live_class_join'      },
  { pattern: /\/quiz/,                   method: 'POST',   type: 'quiz_attempt'         },
  { pattern: /\/auth\/login/,            method: 'POST',   type: 'login'                },
  { pattern: /\/auth\/logout/,           method: 'POST',   type: 'logout'               },
  { pattern: /\/payments\/verify/,       method: 'POST',   type: 'payment'              },
];

const activityTracker = (req, res, next) => {
  // Only track authenticated users
  if (!req.user) return next();

  const matched = TRACK_MAP.find(
    rule => rule.method === req.method && rule.pattern.test(req.path)
  );
  if (!matched) return next();

  const originalJson = res.json.bind(res);
  res.json = function intercept(body) {
    const result = originalJson(body);

    // Only record on success (2xx)
    if (res.statusCode >= 200 && res.statusCode < 300) {
      setImmediate(async () => {
        try {
          const { ActivityLog, StudentProfile } = require('../models');

          await ActivityLog.create({
            user:        req.user._id,
            type:        matched.type,
            description: `${matched.type} via ${req.method} ${req.path}`,
            metadata: {
              path:      req.path,
              params:    req.params,
              requestId: req.id
            },
            ip:        req.ip,
            userAgent: req.headers['user-agent']
          });

          // Update student streak (lastStudyDate)
          if (['lesson_complete', 'mock_test_attempt', 'dpq_attempt', 'quiz_attempt'].includes(matched.type)) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const profile = await StudentProfile.findOne({ user: req.user._id }).lean();
            if (profile) {
              const lastStudy = profile.lastStudyDate ? new Date(profile.lastStudyDate) : null;
              lastStudy?.setHours(0, 0, 0, 0);

              const isNewDay = !lastStudy || lastStudy.getTime() < today.getTime();
              const isConsecutive = lastStudy &&
                (today.getTime() - lastStudy.getTime() === 86400000); // exactly 1 day ago

              const update = { lastStudyDate: new Date() };
              if (isNewDay) {
                update.currentStreak = isConsecutive
                  ? (profile.currentStreak || 0) + 1
                  : 1;
                update.longestStreak = Math.max(
                  profile.longestStreak || 0,
                  update.currentStreak
                );
              }

              await StudentProfile.updateOne({ user: req.user._id }, update);
            }
          }

        } catch (err) {
          logger.warn('Activity tracker failed', { error: err.message, userId: req.user._id });
        }
      });
    }

    return result;
  };

  next();
};

module.exports = activityTracker;