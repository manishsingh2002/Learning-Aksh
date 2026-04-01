// models/engagementModel.js
// ============================================================
// ENGAGEMENT — Gamification, Notifications, Announcements
// ============================================================
// Badge, UserBadge     → achievements & rewards
// StudentNote          → private notes during video
// Notification         → in-app notifications
// Announcement         → instructor broadcasts to students
// ============================================================

const mongoose = require('mongoose');

// ==================== STUDENT NOTE SCHEMA ====================
// Private notes taken during a lesson/video
const studentNoteSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User',   required: true },
  course:  { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
  lesson:  { type: mongoose.Schema.Types.ObjectId, ref: 'Lesson', required: true },

  content:        { type: String, required: true },
  videoTimestamp: { type: Number, default: 0 },    // seconds into video
  isDeleted:      { type: Boolean, default: false }
}, { timestamps: true });

studentNoteSchema.index({ student: 1, lesson: 1 });
studentNoteSchema.index({ student: 1, course: 1 });

// ==================== BADGE SCHEMA ====================
const badgeSchema = new mongoose.Schema({
  name:        { type: String, required: true, unique: true },
  description: { type: String, required: true },
  iconUrl:     { type: String, required: true },
  bannerColor: String,    // hex color for UI

  criteria: {
    type: String,
    required: true,
    validate: {
      validator: async function (value) {
        if (!value) return true;
        const Master = mongoose.model('Master');
        return await Master.validateValue('badge_criteria', value);
      },
      message: 'Invalid badge criteria'
    }
  },

  // Threshold for criteria (e.g., streak_days: 30)
  criteriaValue: Number,

  points:     { type: Number, default: 0 },
  isActive:   { type: Boolean, default: true }
}, { timestamps: true });

// ==================== USER BADGE SCHEMA ====================
const userBadgeSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User',  required: true },
  badge:   { type: mongoose.Schema.Types.ObjectId, ref: 'Badge', required: true },
  earnedAt: { type: Date, default: Date.now },
  context:  mongoose.Schema.Types.Mixed   // { courseId, examGoalId, etc. }
}, { timestamps: true });

userBadgeSchema.index({ student: 1, badge: 1 }, { unique: true });
userBadgeSchema.index({ student: 1, earnedAt: -1 });

// ==================== NOTIFICATION SCHEMA ====================
const notificationSchema = new mongoose.Schema({
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  type: {
    type: String,
    validate: {
      validator: async function (value) {
        if (!value) return true;
        const Master = mongoose.model('Master');
        return await Master.validateValue('notification_type', value);
      },
      message: 'Invalid notification type'
    }
  },

  title:   { type: String, required: true },
  message: { type: String, required: true },

  // Deep link data
  data: {
    refType: String,    // "Course", "MockTest", "LiveClass", "Payment"
    refId:   mongoose.Schema.Types.ObjectId,
    url:     String
  },

  isRead:    { type: Boolean, default: false },
  readAt:    Date,
  isSent:    { type: Boolean, default: false },   // push/email sent?
  sentAt:    Date
}, { timestamps: true });

notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, createdAt: -1 });

// ==================== ANNOUNCEMENT SCHEMA ====================
// Instructor broadcasts to enrolled students of a batch/course
const announcementSchema = new mongoose.Schema({
  // Scope (one of these)
  batch:    { type: mongoose.Schema.Types.ObjectId, ref: 'Batch' },
  course:   { type: mongoose.Schema.Types.ObjectId, ref: 'Course' },
  examGoal: { type: mongoose.Schema.Types.ObjectId, ref: 'ExamGoal' },

  instructor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  title:   { type: String, required: true },
  content: { type: String, required: true },   // rich text / HTML

  attachments: [{ title: String, url: String, type: String }],

  sendEmailNotification: { type: Boolean, default: true },
  sendPushNotification:  { type: Boolean, default: true },

  isPinned:  { type: Boolean, default: false },
  isDeleted: { type: Boolean, default: false }
}, { timestamps: true });

announcementSchema.index({ batch: 1, createdAt: -1 });
announcementSchema.index({ course: 1, createdAt: -1 });

// ==================== EXPORTS ====================
module.exports = {
  StudentNote:   mongoose.models.StudentNote   || mongoose.model('StudentNote',   studentNoteSchema),
  Badge:         mongoose.models.Badge         || mongoose.model('Badge',         badgeSchema),
  UserBadge:     mongoose.models.UserBadge     || mongoose.model('UserBadge',     userBadgeSchema),
  Notification:  mongoose.models.Notification  || mongoose.model('Notification',  notificationSchema),
  Announcement:  mongoose.models.Announcement  || mongoose.model('Announcement',  announcementSchema)
};
