'use strict';

// scripts/seedMasterData.js
// ============================================================
// MASTER DATA SEEDER
// Run once after first deployment:  npm run seed:master
// Safe to re-run — uses upsert (no duplicates).
// ============================================================

require('dotenv').config();
const mongoose = require('mongoose');
const Master   = require('../models/masterModel');

// ── ALL MASTER DATA ───────────────────────────────────────────
const MASTER_DATA = [

  // ── User ────────────────────────────────────────────────────
  { type: 'user_gender', name: 'Male',              code: 'MALE',               metadata: { sortOrder: 1 } },
  { type: 'user_gender', name: 'Female',            code: 'FEMALE',             metadata: { sortOrder: 2 } },
  { type: 'user_gender', name: 'Other',             code: 'OTHER',              metadata: { sortOrder: 3 } },
  { type: 'user_gender', name: 'Prefer not to say', code: 'PREFER_NOT_TO_SAY', metadata: { sortOrder: 4 } },

  // ── Language ────────────────────────────────────────────────
  { type: 'language', name: 'English', code: 'EN', metadata: { sortOrder: 1 } },
  { type: 'language', name: 'Hindi',   code: 'HI', metadata: { sortOrder: 2 } },
  { type: 'language', name: 'Tamil',   code: 'TA', metadata: { sortOrder: 3 } },
  { type: 'language', name: 'Telugu',  code: 'TE', metadata: { sortOrder: 4 } },
  { type: 'language', name: 'Kannada', code: 'KN', metadata: { sortOrder: 5 } },
  { type: 'language', name: 'Marathi', code: 'MR', metadata: { sortOrder: 6 } },
  { type: 'language', name: 'Gujarati',code: 'GU', metadata: { sortOrder: 7 } },
  { type: 'language', name: 'Bengali', code: 'BN', metadata: { sortOrder: 8 } },
  { type: 'language', name: 'Punjabi', code: 'PA', metadata: { sortOrder: 9 } },

  // ── UI Theme ────────────────────────────────────────────────
  { type: 'ui_theme', name: 'Light',  code: 'LIGHT',  metadata: { sortOrder: 1 } },
  { type: 'ui_theme', name: 'Dark',   code: 'DARK',   metadata: { sortOrder: 2 } },
  { type: 'ui_theme', name: 'System', code: 'SYSTEM', metadata: { sortOrder: 3 } },

  // ── Topic Area ──────────────────────────────────────────────
  { type: 'topic_area', name: 'Mathematics',        code: 'MATHEMATICS',        metadata: { sortOrder: 1 } },
  { type: 'topic_area', name: 'Science',            code: 'SCIENCE',            metadata: { sortOrder: 2 } },
  { type: 'topic_area', name: 'History',            code: 'HISTORY',            metadata: { sortOrder: 3 } },
  { type: 'topic_area', name: 'Geography',          code: 'GEOGRAPHY',          metadata: { sortOrder: 4 } },
  { type: 'topic_area', name: 'Economics',          code: 'ECONOMICS',          metadata: { sortOrder: 5 } },
  { type: 'topic_area', name: 'Polity',             code: 'POLITY',             metadata: { sortOrder: 6 } },
  { type: 'topic_area', name: 'Environment',        code: 'ENVIRONMENT',        metadata: { sortOrder: 7 } },
  { type: 'topic_area', name: 'Current Affairs',    code: 'CURRENT_AFFAIRS',    metadata: { sortOrder: 8 } },
  { type: 'topic_area', name: 'Reasoning',          code: 'REASONING',          metadata: { sortOrder: 9 } },
  { type: 'topic_area', name: 'English',            code: 'ENGLISH',            metadata: { sortOrder: 10 } },
  { type: 'topic_area', name: 'Hindi',              code: 'HINDI',              metadata: { sortOrder: 11 } },
  { type: 'topic_area', name: 'General Knowledge',  code: 'GENERAL_KNOWLEDGE',  metadata: { sortOrder: 12 } },
  { type: 'topic_area', name: 'Science & Tech',     code: 'SCIENCE_TECH',       metadata: { sortOrder: 13 } },
  { type: 'topic_area', name: 'Quantitative Aptitude', code: 'QUANT',           metadata: { sortOrder: 14 } },

  // ── Lesson Type ─────────────────────────────────────────────
  { type: 'lesson_type', name: 'Video',            code: 'VIDEO',            metadata: { sortOrder: 1 } },
  { type: 'lesson_type', name: 'Article',          code: 'ARTICLE',          metadata: { sortOrder: 2 } },
  { type: 'lesson_type', name: 'Quiz',             code: 'QUIZ',             metadata: { sortOrder: 3 } },
  { type: 'lesson_type', name: 'Assignment',       code: 'ASSIGNMENT',       metadata: { sortOrder: 4 } },
  { type: 'lesson_type', name: 'Coding Exercise',  code: 'CODING_EXERCISE',  metadata: { sortOrder: 5 } },
  { type: 'lesson_type', name: 'Live Class',       code: 'LIVE_CLASS',       metadata: { sortOrder: 6 } },

  // ── Video Provider ──────────────────────────────────────────
  { type: 'video_provider', name: 'YouTube',    code: 'YOUTUBE',    metadata: { sortOrder: 1 } },
  { type: 'video_provider', name: 'Cloudinary', code: 'CLOUDINARY', metadata: { sortOrder: 2 } },
  { type: 'video_provider', name: 'Bunny CDN',  code: 'BUNNY',      metadata: { sortOrder: 3 } },
  { type: 'video_provider', name: 'Vimeo',      code: 'VIMEO',      metadata: { sortOrder: 4 } },
  { type: 'video_provider', name: 'Custom',     code: 'CUSTOM',     metadata: { sortOrder: 5 } },

  // ── Resource Type ───────────────────────────────────────────
  { type: 'resource_type', name: 'PDF',   code: 'PDF',   metadata: { sortOrder: 1 } },
  { type: 'resource_type', name: 'Doc',   code: 'DOC',   metadata: { sortOrder: 2 } },
  { type: 'resource_type', name: 'ZIP',   code: 'ZIP',   metadata: { sortOrder: 3 } },
  { type: 'resource_type', name: 'Link',  code: 'LINK',  metadata: { sortOrder: 4 } },
  { type: 'resource_type', name: 'Image', code: 'IMAGE', metadata: { sortOrder: 5 } },

  // ── Instructor Role ─────────────────────────────────────────
  { type: 'instructor_role', name: 'Primary',             code: 'PRIMARY',              metadata: { sortOrder: 1 } },
  { type: 'instructor_role', name: 'Co-Instructor',       code: 'CO_INSTRUCTOR',        metadata: { sortOrder: 2 } },
  { type: 'instructor_role', name: 'Teaching Assistant',  code: 'TEACHING_ASSISTANT',   metadata: { sortOrder: 3 } },

  // ── Invitation Status ───────────────────────────────────────
  { type: 'invitation_status', name: 'Pending',  code: 'PENDING',  metadata: { sortOrder: 1 } },
  { type: 'invitation_status', name: 'Accepted', code: 'ACCEPTED', metadata: { sortOrder: 2 } },
  { type: 'invitation_status', name: 'Expired',  code: 'EXPIRED',  metadata: { sortOrder: 3 } },
  { type: 'invitation_status', name: 'Revoked',  code: 'REVOKED',  metadata: { sortOrder: 4 } },

  // ── Assignment Submission Type ───────────────────────────────
  { type: 'assignment_submission_type', name: 'File Upload', code: 'FILE_UPLOAD', metadata: { sortOrder: 1 } },
  { type: 'assignment_submission_type', name: 'Text',        code: 'TEXT',        metadata: { sortOrder: 2 } },
  { type: 'assignment_submission_type', name: 'Link',        code: 'LINK',        metadata: { sortOrder: 3 } },
  { type: 'assignment_submission_type', name: 'GitHub',      code: 'GITHUB',      metadata: { sortOrder: 4 } },

  // ── Assignment Status ───────────────────────────────────────
  { type: 'assignment_status', name: 'Submitted',           code: 'SUBMITTED',            metadata: { sortOrder: 1 } },
  { type: 'assignment_status', name: 'Graded',              code: 'GRADED',               metadata: { sortOrder: 2 } },
  { type: 'assignment_status', name: 'Revision Requested',  code: 'REVISION_REQUESTED',   metadata: { sortOrder: 3 } },
  { type: 'assignment_status', name: 'Late',                code: 'LATE',                 metadata: { sortOrder: 4 } },

  // ── Programming Language ────────────────────────────────────
  { type: 'programming_language', name: 'JavaScript', code: 'JAVASCRIPT', metadata: { sortOrder: 1 } },
  { type: 'programming_language', name: 'Python',     code: 'PYTHON',     metadata: { sortOrder: 2 } },
  { type: 'programming_language', name: 'Java',       code: 'JAVA',       metadata: { sortOrder: 3 } },
  { type: 'programming_language', name: 'C++',        code: 'CPP',        metadata: { sortOrder: 4 } },
  { type: 'programming_language', name: 'C',          code: 'C',          metadata: { sortOrder: 5 } },
  { type: 'programming_language', name: 'SQL',        code: 'SQL',        metadata: { sortOrder: 6 } },

  // ── Difficulty Level ────────────────────────────────────────
  { type: 'difficulty_level', name: 'Easy',   code: 'EASY',   metadata: { sortOrder: 1 } },
  { type: 'difficulty_level', name: 'Medium', code: 'MEDIUM', metadata: { sortOrder: 2 } },
  { type: 'difficulty_level', name: 'Hard',   code: 'HARD',   metadata: { sortOrder: 3 } },
  { type: 'difficulty_level', name: 'Expert', code: 'EXPERT', metadata: { sortOrder: 4 } },

  // ── Code Submission Status ──────────────────────────────────
  { type: 'code_submission_status', name: 'Pending', code: 'PENDING', metadata: { sortOrder: 1 } },
  { type: 'code_submission_status', name: 'Running', code: 'RUNNING', metadata: { sortOrder: 2 } },
  { type: 'code_submission_status', name: 'Passed',  code: 'PASSED',  metadata: { sortOrder: 3 } },
  { type: 'code_submission_status', name: 'Failed',  code: 'FAILED',  metadata: { sortOrder: 4 } },
  { type: 'code_submission_status', name: 'Error',   code: 'ERROR',   metadata: { sortOrder: 5 } },

  // ── Payment Method ──────────────────────────────────────────
  { type: 'payment_method', name: 'Razorpay',     code: 'RAZORPAY',      metadata: { sortOrder: 1 } },
  { type: 'payment_method', name: 'UPI',          code: 'UPI',           metadata: { sortOrder: 2 } },
  { type: 'payment_method', name: 'Stripe',       code: 'STRIPE',        metadata: { sortOrder: 3 } },
  { type: 'payment_method', name: 'Bank Transfer',code: 'BANK_TRANSFER', metadata: { sortOrder: 4 } },
  { type: 'payment_method', name: 'Cash',         code: 'CASH',          metadata: { sortOrder: 5 } },

  // ── Payment Status ──────────────────────────────────────────
  { type: 'payment_status', name: 'Pending',   code: 'PENDING',   metadata: { sortOrder: 1 } },
  { type: 'payment_status', name: 'Completed', code: 'COMPLETED', metadata: { sortOrder: 2 } },
  { type: 'payment_status', name: 'Failed',    code: 'FAILED',    metadata: { sortOrder: 3 } },
  { type: 'payment_status', name: 'Refunded',  code: 'REFUNDED',  metadata: { sortOrder: 4 } },
  { type: 'payment_status', name: 'Cancelled', code: 'CANCELLED', metadata: { sortOrder: 5 } },

  // ── Currency ────────────────────────────────────────────────
  { type: 'currency', name: 'Indian Rupee', code: 'INR', metadata: { sortOrder: 1 } },
  { type: 'currency', name: 'US Dollar',    code: 'USD', metadata: { sortOrder: 2 } },

  // ── Post Type ───────────────────────────────────────────────
  { type: 'post_type', name: 'Blog',            code: 'BLOG',            metadata: { sortOrder: 1 } },
  { type: 'post_type', name: 'Current Affairs', code: 'CURRENT_AFFAIRS', metadata: { sortOrder: 2 } },
  { type: 'post_type', name: 'Announcement',    code: 'ANNOUNCEMENT',    metadata: { sortOrder: 3 } },
  { type: 'post_type', name: 'News',            code: 'NEWS',            metadata: { sortOrder: 4 } },

  // ── Post Status ─────────────────────────────────────────────
  { type: 'post_status', name: 'Draft',        code: 'DRAFT',        metadata: { sortOrder: 1 } },
  { type: 'post_status', name: 'Published',    code: 'PUBLISHED',    metadata: { sortOrder: 2 } },
  { type: 'post_status', name: 'Scheduled',    code: 'SCHEDULED',    metadata: { sortOrder: 3 } },
  { type: 'post_status', name: 'Under Review', code: 'UNDER_REVIEW', metadata: { sortOrder: 4 } },
  { type: 'post_status', name: 'Archived',     code: 'ARCHIVED',     metadata: { sortOrder: 5 } },

  // ── Badge Criteria ──────────────────────────────────────────
  { type: 'badge_criteria', name: 'First Login',       code: 'FIRST_LOGIN',      metadata: { sortOrder: 1 } },
  { type: 'badge_criteria', name: 'Course Complete',   code: 'COURSE_COMPLETE',  metadata: { sortOrder: 2 } },
  { type: 'badge_criteria', name: '7-Day Streak',      code: 'STREAK_7',         metadata: { sortOrder: 3 } },
  { type: 'badge_criteria', name: '30-Day Streak',     code: 'STREAK_30',        metadata: { sortOrder: 4 } },
  { type: 'badge_criteria', name: 'Top Scorer',        code: 'TOP_SCORER',       metadata: { sortOrder: 5 } },
  { type: 'badge_criteria', name: 'Perfect Score',     code: 'PERFECT_SCORE',    metadata: { sortOrder: 6 } },
  { type: 'badge_criteria', name: 'First Mock Test',   code: 'FIRST_MOCK_TEST',  metadata: { sortOrder: 7 } },
  { type: 'badge_criteria', name: '10 Mock Tests',     code: 'MOCK_TEST_10',     metadata: { sortOrder: 8 } },

  // ── Exam Body ───────────────────────────────────────────────
  { type: 'exam_body', name: 'UPSC',       code: 'UPSC',       metadata: { sortOrder: 1, isFeatured: true } },
  { type: 'exam_body', name: 'SSC',        code: 'SSC',        metadata: { sortOrder: 2, isFeatured: true } },
  { type: 'exam_body', name: 'IBPS',       code: 'IBPS',       metadata: { sortOrder: 3, isFeatured: true } },
  { type: 'exam_body', name: 'RBI',        code: 'RBI',        metadata: { sortOrder: 4 } },
  { type: 'exam_body', name: 'Railway',    code: 'RAILWAY',    metadata: { sortOrder: 5, isFeatured: true } },
  { type: 'exam_body', name: 'State PSC',  code: 'STATE_PSC',  metadata: { sortOrder: 6 } },
  { type: 'exam_body', name: 'GATE',       code: 'GATE',       metadata: { sortOrder: 7 } },
  { type: 'exam_body', name: 'JEE',        code: 'JEE',        metadata: { sortOrder: 8, isFeatured: true } },
  { type: 'exam_body', name: 'NEET',       code: 'NEET',       metadata: { sortOrder: 9, isFeatured: true } },
  { type: 'exam_body', name: 'NDA',        code: 'NDA',        metadata: { sortOrder: 10 } },
  { type: 'exam_body', name: 'CDS',        code: 'CDS',        metadata: { sortOrder: 11 } },
  { type: 'exam_body', name: 'Defence',    code: 'DEFENCE',    metadata: { sortOrder: 12 } },

  // ── Exam Type ───────────────────────────────────────────────
  { type: 'exam_type', name: 'Prelims',   code: 'PRELIMS',   metadata: { sortOrder: 1 } },
  { type: 'exam_type', name: 'Mains',     code: 'MAINS',     metadata: { sortOrder: 2 } },
  { type: 'exam_type', name: 'Interview', code: 'INTERVIEW', metadata: { sortOrder: 3 } },
  { type: 'exam_type', name: 'Written',   code: 'WRITTEN',   metadata: { sortOrder: 4 } },
  { type: 'exam_type', name: 'Practical', code: 'PRACTICAL', metadata: { sortOrder: 5 } },

  // ── Batch Type ──────────────────────────────────────────────
  { type: 'batch_type', name: 'Live',     code: 'LIVE',     metadata: { sortOrder: 1 } },
  { type: 'batch_type', name: 'Recorded', code: 'RECORDED', metadata: { sortOrder: 2 } },
  { type: 'batch_type', name: 'Hybrid',   code: 'HYBRID',   metadata: { sortOrder: 3 } },

  // ── Question Type ───────────────────────────────────────────
  { type: 'question_type', name: 'Multiple Choice',    code: 'MCQ',              metadata: { sortOrder: 1 } },
  { type: 'question_type', name: 'True / False',       code: 'TRUE_FALSE',       metadata: { sortOrder: 2 } },
  { type: 'question_type', name: 'Fill in the Blank',  code: 'FILL_BLANK',       metadata: { sortOrder: 3 } },
  { type: 'question_type', name: 'Descriptive',        code: 'DESCRIPTIVE',      metadata: { sortOrder: 4 } },
  { type: 'question_type', name: 'Match the Following',code: 'MATCH_FOLLOWING',  metadata: { sortOrder: 5 } },

  // ── Study Plan Status ───────────────────────────────────────
  { type: 'study_plan_status', name: 'Active',     code: 'ACTIVE',     metadata: { sortOrder: 1 } },
  { type: 'study_plan_status', name: 'Completed',  code: 'COMPLETED',  metadata: { sortOrder: 2 } },
  { type: 'study_plan_status', name: 'Paused',     code: 'PAUSED',     metadata: { sortOrder: 3 } },
  { type: 'study_plan_status', name: 'Abandoned',  code: 'ABANDONED',  metadata: { sortOrder: 4 } },

  // ── Notification Type ───────────────────────────────────────
  { type: 'notification_type', name: 'Announcement',    code: 'ANNOUNCEMENT',    metadata: { sortOrder: 1 } },
  { type: 'notification_type', name: 'Result',          code: 'RESULT',          metadata: { sortOrder: 2 } },
  { type: 'notification_type', name: 'Class Reminder',  code: 'CLASS_REMINDER',  metadata: { sortOrder: 3 } },
  { type: 'notification_type', name: 'Payment',         code: 'PAYMENT',         metadata: { sortOrder: 4 } },
  { type: 'notification_type', name: 'Badge',           code: 'BADGE',           metadata: { sortOrder: 5 } },
  { type: 'notification_type', name: 'System',          code: 'SYSTEM',          metadata: { sortOrder: 6 } }
];

// ── RUN SEEDER ────────────────────────────────────────────────
const seed = async () => {
  console.log('\n🌱 Starting master data seed...\n');

  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB connected\n');

    let created = 0;
    let skipped = 0;

    for (const item of MASTER_DATA) {
      // Build slug from name
      const slug = item.name.toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^\w\-]+/g, '')
        .replace(/\-\-+/g, '-');

      const result = await Master.updateOne(
        { type: item.type, name: item.name },
        {
          $setOnInsert: {
            ...item,
            slug: `${slug}-${Math.random().toString(36).slice(2, 8)}`
          }
        },
        { upsert: true }
      );

      if (result.upsertedCount > 0) {
        console.log(`  ✅  [${item.type}] ${item.name}`);
        created++;
      } else {
        skipped++;
      }
    }

    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`  Seed complete!`);
    console.log(`  Created : ${created}`);
    console.log(`  Skipped : ${skipped} (already existed)`);
    console.log(`  Total   : ${MASTER_DATA.length}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  } catch (err) {
    console.error('\n❌ Seed failed:', err.message);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('MongoDB connection closed.\n');
    process.exit(0);
  }
};

seed();