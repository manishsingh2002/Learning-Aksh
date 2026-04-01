'use strict';

// controllers/dropdownController.js
// ============================================================
// DROPDOWN — All frontend select/filter/autocomplete data
// ============================================================
// The frontend never hardcodes lists. Everything comes here.
// One endpoint returns exactly what each form/screen needs.
// All responses are Redis-cached (LONG TTL).
//
// GET /api/v1/dropdowns/all          → every dropdown at once
// GET /api/v1/dropdowns/master/:type → single master type
// GET /api/v1/dropdowns/exam-goals   → exam goal options
// GET /api/v1/dropdowns/categories   → category tree
// GET /api/v1/dropdowns/subjects/:examGoalId → syllabus subjects
// GET /api/v1/dropdowns/languages
// GET /api/v1/dropdowns/batches      → for enrollment forms (auth)
// GET /api/v1/dropdowns/instructors  → for admin selects
// ============================================================

const catchAsync = require('../utils/catchAsync');
const AppError   = require('../utils/appError');
const cache      = require('../utils/cache');
const { Master, Category, ExamGoal, Batch, User } = require('../models');

// ── MASTER FETCH HELPER ───────────────────────────────────────
const getMasterByType = async (type) => {
  return await cache.remember(
    cache.keys.masterData(type),
    () => Master.find({ type, isActive: true })
                .select('name code slug description imageUrl metadata')
                .sort('metadata.sortOrder name')
                .lean(),
    cache.TTL.LONG
  );
};

// ── FORMAT: Convert master docs to { label, value, meta } ────
const formatMaster = (docs) =>
  docs.map(d => ({
    label: d.name,
    value: d.code || d.slug,
    slug:  d.slug,
    code:  d.code,
    meta:  d.description || null,
    image: d.imageUrl    || null,
    order: d.metadata?.sortOrder ?? 0
  }));

// ── ALL DROPDOWNS AT ONCE ─────────────────────────────────────
// Single call on app boot — frontend caches this locally
exports.getAllDropdowns = catchAsync(async (req, res, next) => {
  const CACHE_KEY = 'dropdowns:all';

  const data = await cache.remember(CACHE_KEY, async () => {
    // Fetch all master types in parallel
    const [
      genders, languages, themes, topics,
      lessonTypes, videoProviders, resourceTypes,
      instructorRoles, invitationStatuses,
      submissionTypes, assignmentStatuses,
      programmingLanguages, difficultyLevels,
      codeSubmissionStatuses, paymentMethods,
      paymentStatuses, currencies,
      postTypes, postStatuses,
      badgeCriteria, examBodies, examTypes,
      batchTypes, questionTypes,
      studyPlanStatuses, notificationTypes,
      categories, examGoals
    ] = await Promise.all([
      getMasterByType('user_gender'),
      getMasterByType('language'),
      getMasterByType('ui_theme'),
      getMasterByType('topic_area'),
      getMasterByType('lesson_type'),
      getMasterByType('video_provider'),
      getMasterByType('resource_type'),
      getMasterByType('instructor_role'),
      getMasterByType('invitation_status'),
      getMasterByType('assignment_submission_type'),
      getMasterByType('assignment_status'),
      getMasterByType('programming_language'),
      getMasterByType('difficulty_level'),
      getMasterByType('code_submission_status'),
      getMasterByType('payment_method'),
      getMasterByType('payment_status'),
      getMasterByType('currency'),
      getMasterByType('post_type'),
      getMasterByType('post_status'),
      getMasterByType('badge_criteria'),
      getMasterByType('exam_body'),
      getMasterByType('exam_type'),
      getMasterByType('batch_type'),
      getMasterByType('question_type'),
      getMasterByType('study_plan_status'),
      getMasterByType('notification_type'),

      // Non-master dropdowns
      Category.find({ isActive: true, isDeleted: false, parentCategory: null })
        .select('name slug icon image')
        .sort('sortOrder name')
        .lean(),

      ExamGoal.find({ isActive: true, isDeleted: false })
        .select('name slug icon examBody examSeries examYear')
        .sort('-isFeatured name')
        .lean()
    ]);

    return {
      // User
      genders:           formatMaster(genders),
      languages:         formatMaster(languages),
      themes:            formatMaster(themes),
      topics:            formatMaster(topics),

      // Course / Lesson
      lessonTypes:       formatMaster(lessonTypes),
      videoProviders:    formatMaster(videoProviders),
      resourceTypes:     formatMaster(resourceTypes),
      difficultyLevels:  formatMaster(difficultyLevels),

      // Instructor
      instructorRoles:   formatMaster(instructorRoles),
      invitationStatuses: formatMaster(invitationStatuses),

      // Assignments / Coding
      submissionTypes:          formatMaster(submissionTypes),
      assignmentStatuses:       formatMaster(assignmentStatuses),
      programmingLanguages:     formatMaster(programmingLanguages),
      codeSubmissionStatuses:   formatMaster(codeSubmissionStatuses),

      // Payment
      paymentMethods:    formatMaster(paymentMethods),
      paymentStatuses:   formatMaster(paymentStatuses),
      currencies:        formatMaster(currencies),

      // Content / Posts
      postTypes:         formatMaster(postTypes),
      postStatuses:      formatMaster(postStatuses),

      // Exam / Test
      examBodies:        formatMaster(examBodies),
      examTypes:         formatMaster(examTypes),
      batchTypes:        formatMaster(batchTypes),
      questionTypes:     formatMaster(questionTypes),

      // Misc
      badgeCriteria:     formatMaster(badgeCriteria),
      studyPlanStatuses: formatMaster(studyPlanStatuses),
      notificationTypes: formatMaster(notificationTypes),

      // Entity dropdowns
      categories: categories.map(c => ({
        label: c.name,
        value: c._id,
        slug:  c.slug,
        icon:  c.icon,
        image: c.image
      })),

      examGoals: examGoals.map(g => ({
        label:     g.name,
        value:     g._id,
        slug:      g.slug,
        icon:      g.icon,
        examBody:  g.examBody,
        series:    g.examSeries,
        year:      g.examYear
      }))
    };
  }, cache.TTL.LONG);

  res.status(200).json({ status: 'success', data });
});

// ── SINGLE MASTER TYPE ────────────────────────────────────────
// GET /api/v1/dropdowns/master/exam_body
exports.getMasterDropdown = catchAsync(async (req, res, next) => {
  const { type } = req.params;
  if (!type) return next(new AppError('Master type is required.', 400));

  const docs = await getMasterByType(type);
  res.status(200).json({
    status: 'success',
    data:   formatMaster(docs)
  });
});

// ── EXAM GOAL OPTIONS (with stage info) ───────────────────────
// GET /api/v1/dropdowns/exam-goals?examBody=UPSC
exports.getExamGoalOptions = catchAsync(async (req, res, next) => {
  const filter = { isActive: true, isDeleted: false };
  if (req.query.examBody) filter.examBody = req.query.examBody.toUpperCase();

  const goals = await cache.remember(
    `dropdown:examgoals:${req.query.examBody || 'all'}`,
    () => ExamGoal.find(filter)
      .select('name slug icon examBody examSeries examYear stages totalEnrolledStudents totalBatches')
      .sort('-isFeatured -totalEnrolledStudents')
      .lean(),
    cache.TTL.LONG
  );

  res.status(200).json({
    status: 'success',
    data: goals.map(g => ({
      label:              g.name,
      value:              g._id,
      slug:               g.slug,
      icon:               g.icon,
      examBody:           g.examBody,
      series:             g.examSeries,
      year:               g.examYear,
      enrolledStudents:   g.totalEnrolledStudents,
      availableBatches:   g.totalBatches,
      stages:             g.stages?.map(s => ({ label: s.name, value: s.name, order: s.order })) || []
    }))
  });
});

// ── CATEGORY TREE (full hierarchy) ───────────────────────────
// GET /api/v1/dropdowns/categories
exports.getCategoryOptions = catchAsync(async (req, res, next) => {
  const all = await cache.remember('dropdown:categories', async () => {
    return await Category.find({ isActive: true, isDeleted: false })
      .select('name slug icon parentCategory sortOrder')
      .sort('sortOrder name')
      .lean();
  }, cache.TTL.LONG);

  // Build flat list with parent context for select components
  // (Ant Design / MUI Select prefer flat list with grouping)
  const flat = all.map(c => ({
    label:    c.parentCategory ? `  ${c.name}` : c.name,
    value:    c._id,
    slug:     c.slug,
    icon:     c.icon,
    parentId: c.parentCategory || null,
    isParent: !c.parentCategory
  }));

  // Also build nested tree for cascading selects
  const map = {};
  const roots = [];
  all.forEach(c => { map[c._id] = { label: c.name, value: c._id, slug: c.slug, icon: c.icon, children: [] }; });
  all.forEach(c => {
    if (c.parentCategory) map[c.parentCategory]?.children.push(map[c._id]);
    else roots.push(map[c._id]);
  });

  res.status(200).json({ status: 'success', data: { flat, tree: roots } });
});

// ── SUBJECTS FOR EXAM GOAL ────────────────────────────────────
// GET /api/v1/dropdowns/subjects/:examGoalId
// Returns syllabus subjects + topics for form selects
exports.getSubjectOptions = catchAsync(async (req, res, next) => {
  const goal = await cache.remember(
    `dropdown:subjects:${req.params.examGoalId}`,
    () => ExamGoal.findById(req.params.examGoalId).select('name syllabus').lean(),
    cache.TTL.LONG
  );

  if (!goal) return next(new AppError('Exam goal not found.', 404));

  const subjects = (goal.syllabus || []).map(s => ({
    label:    s.subject,
    value:    s.subject,
    topics:   s.topics?.map(t => ({ label: t.name, value: t.name })) || []
  }));

  res.status(200).json({ status: 'success', data: subjects });
});

// ── BATCHES FOR ENROLLMENT FORM ───────────────────────────────
// GET /api/v1/dropdowns/batches?examGoal=xxx  (auth optional)
exports.getBatchOptions = catchAsync(async (req, res, next) => {
  const filter = {
    isPublished: true,
    isApproved:  true,
    isDeleted:   false,
    startDate:   { $gte: new Date() }  // only upcoming/active batches
  };
  if (req.query.examGoal) filter.examGoal = req.query.examGoal;
  if (req.query.type)     filter.type     = req.query.type;

  const batches = await Batch.find(filter)
    .select('name type price discountPrice isFree startDate endDate maxStudents totalEnrollments examGoal features language')
    .populate('examGoal', 'name icon examBody')
    .populate('primaryInstructor', 'firstName lastName')
    .sort('startDate')
    .limit(50)
    .lean();

  res.status(200).json({
    status: 'success',
    data: batches.map(b => ({
      label:       b.name,
      value:       b._id,
      type:        b.type,
      price:       b.isFree ? 0 : (b.discountPrice || b.price),
      isFree:      b.isFree,
      startDate:   b.startDate,
      endDate:     b.endDate,
      language:    b.language,
      instructor:  b.primaryInstructor ? `${b.primaryInstructor.firstName} ${b.primaryInstructor.lastName}` : null,
      examGoal:    b.examGoal ? { label: b.examGoal.name, value: b.examGoal._id, icon: b.examGoal.icon } : null,
      features:    b.features,
      isFull:      b.maxStudents ? b.totalEnrollments >= b.maxStudents : false,
      spots:       b.maxStudents ? Math.max(b.maxStudents - b.totalEnrollments, 0) : null
    }))
  });
});

// ── INSTRUCTOR OPTIONS (for admin forms) ──────────────────────
// GET /api/v1/dropdowns/instructors
exports.getInstructorOptions = catchAsync(async (req, res, next) => {
  const instructors = await User.find({
    role:      'instructor',
    isActive:  true,
    isDeleted: false
  })
  .select('firstName lastName profilePicture email')
  .sort('firstName')
  .limit(200)
  .lean();

  res.status(200).json({
    status: 'success',
    data: instructors.map(i => ({
      label: `${i.firstName} ${i.lastName}`,
      value: i._id,
      email: i.email,
      avatar: i.profilePicture
    }))
  });
});

// ── LANGUAGE OPTIONS (shorthand) ──────────────────────────────
exports.getLanguageOptions = catchAsync(async (req, res, next) => {
  const docs = await getMasterByType('language');
  res.status(200).json({ status: 'success', data: formatMaster(docs) });
});

// ── INVALIDATE DROPDOWN CACHE (admin) ────────────────────────
exports.invalidateDropdownCache = catchAsync(async (req, res, next) => {
  await cache.delPattern('dropdown:*');
  await cache.del('dropdowns:all');
  res.status(200).json({ status: 'success', message: 'Dropdown cache cleared.' });
});