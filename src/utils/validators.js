'use strict';

// utils/validators.js
// ============================================================
// JOI VALIDATORS — Request body validation schemas
// Usage: router.post('/register', validate(schemas.register), authController.register)
// ============================================================
// npm install joi

const Joi    = require('joi');
const AppError = require('./appError');

// ── REUSABLE PRIMITIVES ──────────────────────────────────────
const objectId  = Joi.string().hex().length(24);
const phone     = Joi.string().pattern(/^[6-9]\d{9}$/).messages({ 'string.pattern.base': 'Enter a valid 10-digit Indian mobile number' });
const password  = Joi.string().min(8).max(50).pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/)
  .messages({ 'string.pattern.base': 'Password must have uppercase, lowercase, number, and special character' });
const indianPin = Joi.string().pattern(/^\d{6}$/).messages({ 'string.pattern.base': 'Enter a valid 6-digit PIN code' });
const positiveInt = Joi.number().integer().min(1);
const percentage  = Joi.number().min(0).max(100);

// ── VALIDATE MIDDLEWARE FACTORY ──────────────────────────────
/**
 * Returns Express middleware that validates req.body against a Joi schema.
 * On failure, throws a 422 AppError with field-level details.
 * @param {Joi.Schema} schema
 * @param {string} [source] - 'body' | 'query' | 'params' (default: 'body')
 */
const validate = (schema, source = 'body') => (req, res, next) => {
  const { error, value } = schema.validate(req[source], {
    abortEarly: false,     // collect ALL errors, not just first
    stripUnknown: true,    // remove fields not in schema
    convert: true          // coerce strings to numbers/booleans
  });

  if (error) {
    const fields = {};
    error.details.forEach(d => {
      const key    = d.path.join('.');
      fields[key]  = d.message.replace(/['"]/g, '');
    });
    return next(new AppError('Validation failed', 422, 'VALIDATION_ERROR', { fields }));
  }

  req[source] = value;   // replace with sanitized/coerced value
  next();
};

// ══════════════════════════════════════════════════════════════
// SCHEMAS
// ══════════════════════════════════════════════════════════════

const schemas = {

  // ── AUTH ────────────────────────────────────────────────────

  register: Joi.object({
    firstName:       Joi.string().trim().min(2).max(50).required(),
    lastName:        Joi.string().trim().min(2).max(50).required(),
    email:           Joi.string().email().lowercase().trim().required(),
    password:        password.required(),
    confirmPassword: Joi.string().valid(Joi.ref('password')).required()
      .messages({ 'any.only': 'Passwords do not match' }),
    phoneNumber:     phone.optional(),
    role:            Joi.string().valid('student', 'instructor').default('student')
  }),

  login: Joi.object({
    email:    Joi.string().email().lowercase().trim().required(),
    password: Joi.string().required()
  }),

  forgotPassword: Joi.object({
    email: Joi.string().email().lowercase().required()
  }),

  resetPassword: Joi.object({
    password:        password.required(),
    confirmPassword: Joi.string().valid(Joi.ref('password')).required()
      .messages({ 'any.only': 'Passwords do not match' })
  }),

  changePassword: Joi.object({
    currentPassword: Joi.string().required(),
    newPassword:     password.required(),
    confirmPassword: Joi.string().valid(Joi.ref('newPassword')).required()
      .messages({ 'any.only': 'Passwords do not match' })
  }),

  verifyOTP: Joi.object({
    email: Joi.string().email().lowercase().required(),
    otp:   Joi.string().length(6).pattern(/^\d{6}$/).required()
  }),

  // ── USER PROFILE ────────────────────────────────────────────

  updateProfile: Joi.object({
    firstName:   Joi.string().trim().min(2).max(50),
    lastName:    Joi.string().trim().min(2).max(50),
    phoneNumber: phone,
    dateOfBirth: Joi.date().max('now').iso(),
    gender:      Joi.string().valid('male', 'female', 'other', 'prefer_not_to_say'),
    address: Joi.object({
      street:  Joi.string().max(100),
      city:    Joi.string().max(50),
      state:   Joi.string().max(50),
      country: Joi.string().max(50).default('India'),
      zipCode: indianPin
    })
  }),

  updateInstructorProfile: Joi.object({
    bio:         Joi.string().max(1000),
    experience:  Joi.object({ years: Joi.number().min(0).max(50), summary: Joi.string().max(500) }),
    expertise:   Joi.array().items(Joi.string().max(50)).max(10),
    socialLinks: Joi.object({
      linkedin: Joi.string().uri().optional().allow(''),
      github:   Joi.string().uri().optional().allow(''),
      twitter:  Joi.string().uri().optional().allow(''),
      website:  Joi.string().uri().optional().allow(''),
      youtube:  Joi.string().uri().optional().allow('')
    }),
    qualifications: Joi.array().items(Joi.object({
      degree:      Joi.string().max(100),
      institution: Joi.string().max(150),
      year:        Joi.number().integer().min(1950).max(new Date().getFullYear())
    })).max(10)
  }),

  // ── EXAM GOAL ───────────────────────────────────────────────

  createExamGoal: Joi.object({
    name:        Joi.string().trim().min(3).max(100).required(),
    description: Joi.string().max(1000),
    examBody:    Joi.string().required(),
    examSeries:  Joi.string().max(50),
    examYear:    Joi.number().integer().min(2020).max(2040),
    eligibility: Joi.object({
      minAge:       Joi.number().integer().min(16).max(45),
      maxAge:       Joi.number().integer().min(16).max(60),
      minEducation: Joi.string().max(50),
      nationality:  Joi.string().max(30)
    }),
    totalVacancies: positiveInt,
    isFeatured:     Joi.boolean()
  }),

  // ── BATCH ───────────────────────────────────────────────────

  createBatch: Joi.object({
    name:        Joi.string().trim().min(3).max(150).required(),
    description: Joi.string().max(2000),
    examGoal:    objectId.required(),
    examStage:   Joi.string().max(30),
    category:    objectId,
    type:        Joi.string().valid('live', 'recorded', 'hybrid').required(),
    language:    Joi.string().max(5).default('hi'),
    features: Joi.object({
      hasLiveClasses:    Joi.boolean(),
      hasRecordedVideos: Joi.boolean(),
      hasMockTests:      Joi.boolean(),
      hasDoubtSessions:  Joi.boolean(),
      hasPDFNotes:       Joi.boolean(),
      hasCurrentAffairs: Joi.boolean(),
      hasDailyPractice:  Joi.boolean()
    }),
    startDate:    Joi.date().iso().required(),
    endDate:      Joi.date().iso().greater(Joi.ref('startDate')).required(),
    isFree:       Joi.boolean().default(false),
    price:        Joi.when('isFree', { is: false, then: Joi.number().min(1).required(), otherwise: Joi.number().default(0) }),
    discountPrice: Joi.number().min(0).optional(),
    maxStudents:   positiveInt.optional().allow(null),
    whatYouWillLearn: Joi.array().items(Joi.string().max(200)).max(20),
    targetAudience:   Joi.array().items(Joi.string().max(100)).max(10),
    tags:             Joi.array().items(Joi.string().max(30)).max(15)
  }),

  // ── COURSE ──────────────────────────────────────────────────

  createCourse: Joi.object({
    title:       Joi.string().trim().min(5).max(150).required(),
    subtitle:    Joi.string().max(200),
    description: Joi.string().min(20).max(5000).required(),
    category:    objectId.required(),
    examGoal:    objectId,
    subject:     Joi.string().max(50),
    chapter:     Joi.string().max(100),
    level:       Joi.string().valid('easy', 'medium', 'hard', 'expert').default('easy'),
    language:    Joi.string().max(5).default('hi'),
    price:       Joi.number().min(0).required(),
    discountPrice: Joi.number().min(0).optional(),
    isFree:      Joi.boolean().default(false),
    requirements:     Joi.array().items(Joi.string().max(200)).max(10),
    whatYouWillLearn: Joi.array().items(Joi.string().max(200)).max(20),
    targetAudience:   Joi.array().items(Joi.string().max(100)).max(10),
    tags:             Joi.array().items(Joi.string().max(30)).max(15)
  }),

  createSection: Joi.object({
    title:       Joi.string().trim().min(2).max(150).required(),
    description: Joi.string().max(500),
    order:       Joi.number().integer().min(1).required()
  }),

  createLesson: Joi.object({
    title:       Joi.string().trim().min(2).max(150).required(),
    description: Joi.string().max(500),
    type:        Joi.string().required(),
    order:       Joi.number().integer().min(1).required(),
    isFree:      Joi.boolean().default(false),
    duration:    Joi.number().min(0)
  }),

  // ── MOCK TEST ───────────────────────────────────────────────

  createMockTest: Joi.object({
    title:          Joi.string().trim().min(3).max(200).required(),
    description:    Joi.string().max(2000),
    examGoal:       objectId.required(),
    category:       objectId,
    level:          Joi.string().valid('easy', 'medium', 'hard', 'expert').required(),
    duration:       positiveInt.max(360).required(),
    passingMarks:   Joi.number().min(1).required(),
    hasNegativeMarking:   Joi.boolean().default(false),
    negativeMarkingValue: Joi.number().min(0).max(1).default(0.33),
    instructions:   Joi.array().items(Joi.string().max(300)).max(10),
    tags:           Joi.array().items(Joi.string().max(30)).max(10),
    isFreePreview:  Joi.boolean().default(false),
    subject:        Joi.string().max(50),
    chapter:        Joi.string().max(100),
    isPYQ:          Joi.boolean().default(false),
    year:           Joi.number().integer().min(2000).max(new Date().getFullYear())
  }),

  createMockTestQuestion: Joi.object({
    sectionName: Joi.string().trim().min(2).max(100).required(),
    question:    Joi.string().trim().min(5).max(2000).required(),
    imageUrl:    Joi.string().uri().optional().allow(''),
    options:     Joi.array().items(Joi.object({
      text:      Joi.string().max(500).required(),
      imageUrl:  Joi.string().uri().optional().allow(''),
      isCorrect: Joi.boolean().required()
    })).min(2).max(5).required(),
    marks:         Joi.number().min(0.25).default(1),
    negativeMarks: Joi.number().min(0).default(0),
    explanation:   Joi.string().max(1000),
    subject:       Joi.string().max(50),
    chapter:       Joi.string().max(100),
    topic:         Joi.string().max(100),
    difficulty:    Joi.string().valid('easy', 'medium', 'hard'),
    order:         Joi.number().integer().min(1)
  }),

  submitMockTest: Joi.object({
    answers: Joi.array().items(Joi.object({
      questionId:          objectId.required(),
      selectedOptionIndex: Joi.number().integer().min(0).max(4).allow(null)
    })).required(),
    timeTaken: Joi.number().integer().min(0).required()
  }),

  // ── LIVE CLASS ──────────────────────────────────────────────

  createLiveClass: Joi.object({
    title:       Joi.string().trim().min(3).max(200).required(),
    description: Joi.string().max(1000),
    batch:       objectId.required(),
    course:      objectId,
    subject:     Joi.string().max(50),
    chapter:     Joi.string().max(100),
    topic:       Joi.string().max(100),
    scheduledAt: Joi.date().iso().greater('now').required(),
    duration:    Joi.number().integer().min(15).max(300).default(60),
    streamPlatform: Joi.string().valid('youtube', 'zoom', 'custom').default('youtube')
  }),

  // ── REVIEW ──────────────────────────────────────────────────

  createReview: Joi.object({
    rating:  Joi.number().integer().min(1).max(5).required(),
    title:   Joi.string().trim().max(100),
    comment: Joi.string().trim().min(10).max(1000).required(),
    pros:    Joi.array().items(Joi.string().max(100)).max(5),
    cons:    Joi.array().items(Joi.string().max(100)).max(5)
  }),

  // ── DISCUSSION ──────────────────────────────────────────────

  createDiscussion: Joi.object({
    title:          Joi.string().trim().min(5).max(200).required(),
    content:        Joi.string().trim().min(10).max(5000).required(),
    videoTimestamp: Joi.number().integer().min(0).optional(),
    tags:           Joi.array().items(Joi.string().max(30)).max(5)
  }),

  createReply: Joi.object({
    content: Joi.string().trim().min(2).max(2000).required()
  }),

  // ── POST (BLOG / CURRENT AFFAIRS) ───────────────────────────

  createPost: Joi.object({
    title:    Joi.string().trim().min(5).max(200).required(),
    type:     Joi.string().required(),
    language: Joi.string().max(5).default('en'),
    excerpt:  Joi.string().trim().min(10).max(500).required(),
    content:  Joi.string().min(50).required(),
    category: objectId,
    examGoals: Joi.array().items(objectId).max(5),
    tags:     Joi.array().items(Joi.string().max(30)).max(10),
    sourceName: Joi.string().max(100),
    sourceUrl:  Joi.string().uri().optional().allow(''),
    eventDate:  Joi.date().iso(),
    status:     Joi.string().valid('draft', 'published', 'scheduled').default('draft'),
    isFeatured: Joi.boolean().default(false),
    seo: Joi.object({
      metaTitle:       Joi.string().max(70),
      metaDescription: Joi.string().max(160),
      keywords:        Joi.array().items(Joi.string().max(30)).max(10)
    })
  }),

  // ── COUPON ──────────────────────────────────────────────────

  createCoupon: Joi.object({
    code:           Joi.string().uppercase().alphanum().min(4).max(20).required(),
    description:    Joi.string().max(200),
    discountType:   Joi.string().valid('percentage', 'fixed_amount', 'free').required(),
    discountValue:  Joi.number().min(0).required(),
    maxDiscountAmount: Joi.number().min(0).optional(),
    expiryDate:     Joi.date().iso().greater('now').required(),
    usageLimit:     Joi.number().integer().min(1).optional().allow(null),
    usagePerUser:   Joi.number().integer().min(1).max(10).default(1),
    validForBatches:    Joi.array().items(objectId).max(20),
    validForCourses:    Joi.array().items(objectId).max(20),
    validForTestSeries: Joi.array().items(objectId).max(20)
  }),

  // ── PAYMENT ─────────────────────────────────────────────────

  initiatePayment: Joi.object({
    type:      Joi.string().valid('batch', 'course', 'testSeries', 'mockTest').required(),
    resourceId: objectId.required(),
    couponCode: Joi.string().uppercase().optional().allow('')
  }),

  // ── ANNOUNCEMENT ────────────────────────────────────────────

  createAnnouncement: Joi.object({
    title:   Joi.string().trim().min(3).max(200).required(),
    content: Joi.string().min(10).max(5000).required(),
    batch:   objectId,
    course:  objectId,
    sendEmailNotification: Joi.boolean().default(true),
    sendPushNotification:  Joi.boolean().default(true),
    isPinned: Joi.boolean().default(false)
  }),

  // ── STUDY PLAN ──────────────────────────────────────────────

  createStudyPlan: Joi.object({
    examGoal:  objectId.required(),
    batch:     objectId,
    title:     Joi.string().trim().max(100),
    startDate: Joi.date().iso().required(),
    endDate:   Joi.date().iso().greater(Joi.ref('startDate')).required()
  }),

  // ── PAGINATION / QUERY PARAMS ────────────────────────────────

  paginationQuery: Joi.object({
    page:   Joi.number().integer().min(1).default(1),
    limit:  Joi.number().integer().min(1).max(100).default(20),
    sort:   Joi.string().max(50),
    search: Joi.string().max(100),
    fields: Joi.string().max(200)
  }).unknown(true)   // allow extra filter params
};

module.exports = { validate, schemas };