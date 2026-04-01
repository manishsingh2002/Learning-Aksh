// models/systemModel.js
// ============================================================
// SYSTEM — Audit Logs, Activity Logs, System Settings
// ============================================================

const mongoose = require('mongoose');

// ==================== AUDIT LOG SCHEMA ====================
// Server-side — every API call is logged here for compliance
const auditLogSchema = new mongoose.Schema({
  user:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  action:   String,    // "CREATE_COURSE", "DELETE_USER", "APPROVE_INSTRUCTOR"
  resource: String,    // "Course", "User", "Payment"
  resourceId: mongoose.Schema.Types.ObjectId,

  method:     String,    // "POST", "PUT", "DELETE"
  statusCode: Number,
  ip:         String,
  userAgent:  String,

  requestBody:   { type: mongoose.Schema.Types.Mixed, select: false },
  requestParams: mongoose.Schema.Types.Mixed,
  requestQuery:  mongoose.Schema.Types.Mixed,
  responseBody:  { type: mongoose.Schema.Types.Mixed, select: false },

  duration:  Number,   // ms
  timestamp: { type: Date, default: Date.now }
}, { timestamps: true });

auditLogSchema.index({ user: 1, timestamp: -1 });
auditLogSchema.index({ action: 1, timestamp: -1 });
auditLogSchema.index({ resource: 1, resourceId: 1 });

// ==================== ACTIVITY LOG SCHEMA ====================
// Lightweight user event stream (used for analytics + streak)
const activityLogSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  type: {
    type: String,
    enum: [
      'login', 'logout',
      'enrollment', 'batch_enrollment',
      'lesson_complete', 'course_complete',
      'quiz_attempt', 'mock_test_attempt', 'dpq_attempt',
      'live_class_join', 'live_class_leave',
      'payment', 'refund',
      'review', 'discussion', 'reply',
      'badge_earned', 'certificate_earned',
      'study_plan_created'
    ]
  },

  description: String,
  metadata:    mongoose.Schema.Types.Mixed,   // { courseId, score, etc. }

  ip:        String,
  userAgent: String
}, { timestamps: true });

activityLogSchema.index({ user: 1, createdAt: -1 });
activityLogSchema.index({ type: 1, createdAt: -1 });
activityLogSchema.index({ user: 1, type: 1, createdAt: -1 });

// ==================== SYSTEM SETTINGS SCHEMA ====================
// Admin-configurable key-value platform settings
const systemSettingsSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  value: mongoose.Schema.Types.Mixed,
  type: {
    type: String,
    enum: ['string', 'number', 'boolean', 'object', 'array'],
    default: 'string'
  },
  description: String,
  isPublic:    { type: Boolean, default: false },   // exposed to frontend
  updatedBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

// ==================== EXPORTS ====================
module.exports = {
  AuditLog:       mongoose.models.AuditLog       || mongoose.model('AuditLog',       auditLogSchema),
  ActivityLog:    mongoose.models.ActivityLog    || mongoose.model('ActivityLog',    activityLogSchema),
  SystemSettings: mongoose.models.SystemSettings || mongoose.model('SystemSettings', systemSettingsSchema)
};
