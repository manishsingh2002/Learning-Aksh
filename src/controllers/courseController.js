'use strict';

// controllers/courseController.js
// ============================================================
// COURSE — CRUD, Sections, Lessons, Publish/Approve
// ============================================================

const catchAsync  = require('../utils/catchAsync');
const AppError    = require('../utils/appError');
const factory     = require('../utils/handlerFactory');
const cache       = require('../utils/cache');
const { notifyUser } = require('../utils/socket');
const { uniqueSlug } = require('../utils/helpers');
const { promisifyUpload, uploadThumbnail, uploadVideo, uploadPDF } = require('../utils/upload');
const logger      = require('../utils/logger');
const ApiFeatures = require('../utils/ApiFeatures');
const {
  Course, Section, Lesson, InstructorProfile
} = require('../models');

// ══════════════════════════════════════════════════════════════
// COURSES
// ══════════════════════════════════════════════════════════════

// ── PUBLIC ────────────────────────────────────────────────────

exports.getAllCourses = catchAsync(async (req, res, next) => {
  const baseFilter = { isPublished: true, isApproved: true, isDeleted: false };
  if (req.query.category) baseFilter.category = req.query.category;
  if (req.query.examGoal) baseFilter.examGoal  = req.query.examGoal;
  if (req.query.subject)  baseFilter.subject   = req.query.subject;

  const features = new ApiFeatures(Course.find(baseFilter), req.query)
    .filter().search(['title', 'description']).sort().limitFields().paginate();

  features.populate([
    { path: 'primaryInstructor', select: 'firstName lastName profilePicture' }
  ]);

  const result = await features.execute(Course);
  res.status(200).json({ status: 'success', ...result });
});

exports.getCourse = catchAsync(async (req, res, next) => {
  const filter = req.params.slug
    ? { slug: req.params.slug, isDeleted: false }
    : { _id: req.params.id, isDeleted: false };

  const course = await Course.findOne(filter)
    .populate('primaryInstructor', 'firstName lastName profilePicture bio')
    .populate('category',  'name slug')
    .populate('examGoal',  'name slug icon')
    .lean();

  if (!course) return next(new AppError('Course not found.', 404));

  // Attach section & lesson tree
  const sections = await Section.find({ course: course._id, isDeleted: false })
    .sort('order').lean();

  const lessons = await Lesson.find({ course: course._id, isDeleted: false })
    .select('-content.video.url')   // hide video URL for non-enrolled users
    .sort('section order')
    .lean();

  // Group lessons under sections
  const sectionMap = {};
  sections.forEach(s => { sectionMap[s._id] = { ...s, lessons: [] }; });
  lessons.forEach(l => sectionMap[l.section]?.lessons.push(l));

  res.status(200).json({
    status: 'success',
    data:   { ...course, sections: Object.values(sectionMap) }
  });
});

// ── INSTRUCTOR ────────────────────────────────────────────────

exports.getMyCoursesAsInstructor = catchAsync(async (req, res, next) => {
  req.filter = { primaryInstructor: req.user._id };
  return factory.getAll(Course, { searchFields: ['title'] })(req, res, next);
});

exports.createCourse = catchAsync(async (req, res, next) => {
  const slug   = uniqueSlug(req.body.title);
  const course = await Course.create({
    ...req.body,
    slug,
    primaryInstructor: req.user._id
  });

  await InstructorProfile.findOneAndUpdate(
    { user: req.user._id },
    { $inc: { totalCourses: 1 } }
  );

  logger.info('Course created', { courseId: course._id, instructorId: req.user._id });
  res.status(201).json({ status: 'success', data: course });
});

exports.updateCourse = catchAsync(async (req, res, next) => {
  // Prevent overwriting computed / protected fields
  ['primaryInstructor', 'totalEnrollments', 'rating', 'totalReviews', 'slug'].forEach(f => delete req.body[f]);

  const course = await Course.findOneAndUpdate(
    { _id: req.params.id, primaryInstructor: req.user._id, isDeleted: false },
    req.body,
    { new: true, runValidators: true }
  );
  if (!course) return next(new AppError('Course not found or access denied.', 404));

  await cache.del(`course:${req.params.id}`);
  res.status(200).json({ status: 'success', data: course });
});

exports.uploadCourseThumbnail = catchAsync(async (req, res, next) => {
  await promisifyUpload(uploadThumbnail)(req, res);
  if (!req.file) return next(new AppError('Please upload an image.', 400));

  const course = await Course.findOneAndUpdate(
    { _id: req.params.id, primaryInstructor: req.user._id },
    { thumbnail: req.file.path },
    { new: true }
  );
  if (!course) return next(new AppError('Course not found or access denied.', 404));

  res.status(200).json({ status: 'success', data: { thumbnail: course.thumbnail } });
});

exports.deleteCourse = catchAsync(async (req, res, next) => {
  req.filter = { primaryInstructor: req.user._id };
  return factory.deleteOne(Course)(req, res, next);
});

exports.publishCourse = catchAsync(async (req, res, next) => {
  const course = await Course.findOneAndUpdate(
    { _id: req.params.id, primaryInstructor: req.user._id },
    { isPublished: req.body.publish !== false, publishedAt: new Date() },
    { new: true }
  );
  if (!course) return next(new AppError('Course not found or access denied.', 404));
  res.status(200).json({ status: 'success', data: course });
});

// ── ADMIN ────────────────────────────────────────────────────

exports.getAllCoursesAdmin = factory.getAll(Course, { searchFields: ['title', 'description'] });

exports.approveCourse = catchAsync(async (req, res, next) => {
  const { approve = true, reason } = req.body;
  const course = await Course.findByIdAndUpdate(
    req.params.id,
    { isApproved: approve, approvedBy: req.user._id, approvedAt: approve ? new Date() : null },
    { new: true }
  ).populate('primaryInstructor', 'firstName lastName');

  if (!course) return next(new AppError('Course not found.', 404));

  notifyUser(course.primaryInstructor._id, 'course-approval', {
    courseId: course._id, title: course.title, approved: approve, reason
  });

  res.status(200).json({ status: 'success', data: course });
});

// ══════════════════════════════════════════════════════════════
// SECTIONS
// ══════════════════════════════════════════════════════════════

const verifyCourseOwner = async (courseId, userId) => {
  const course = await Course.findOne({ _id: courseId, primaryInstructor: userId, isDeleted: false }).lean();
  if (!course) throw new AppError('Course not found or access denied.', 404);
  return course;
};

exports.getSections = catchAsync(async (req, res, next) => {
  const sections = await Section.find({ course: req.params.courseId, isDeleted: false })
    .sort('order').lean();
  res.status(200).json({ status: 'success', results: sections.length, data: sections });
});

exports.createSection = catchAsync(async (req, res, next) => {
  await verifyCourseOwner(req.params.courseId, req.user._id);

  const section = await Section.create({ ...req.body, course: req.params.courseId });

  await Course.findByIdAndUpdate(req.params.courseId, { $inc: { totalSections: 1 } });

  res.status(201).json({ status: 'success', data: section });
});

exports.updateSection = catchAsync(async (req, res, next) => {
  await verifyCourseOwner(req.params.courseId, req.user._id);

  const section = await Section.findOneAndUpdate(
    { _id: req.params.sectionId, course: req.params.courseId },
    req.body,
    { new: true, runValidators: true }
  );
  if (!section) return next(new AppError('Section not found.', 404));
  res.status(200).json({ status: 'success', data: section });
});

exports.deleteSection = catchAsync(async (req, res, next) => {
  await verifyCourseOwner(req.params.courseId, req.user._id);

  const section = await Section.findOneAndUpdate(
    { _id: req.params.sectionId, course: req.params.courseId },
    { isDeleted: true },
    { new: true }
  );
  if (!section) return next(new AppError('Section not found.', 404));

  // Soft-delete all lessons in this section
  await Lesson.updateMany({ section: req.params.sectionId }, { isDeleted: true });

  await Course.findByIdAndUpdate(req.params.courseId, { $inc: { totalSections: -1 } });

  res.status(204).json({ status: 'success', data: null });
});

// ══════════════════════════════════════════════════════════════
// LESSONS
// ══════════════════════════════════════════════════════════════

exports.getLessons = catchAsync(async (req, res, next) => {
  const lessons = await Lesson.find({ section: req.params.sectionId, isDeleted: false })
    .sort('order').lean();
  res.status(200).json({ status: 'success', results: lessons.length, data: lessons });
});

exports.getLesson = catchAsync(async (req, res, next) => {
  const lesson = await Lesson.findOne({ _id: req.params.lessonId, isDeleted: false }).lean();
  if (!lesson) return next(new AppError('Lesson not found.', 404));

  // Strip video URL for non-enrolled students (free lessons are exception)
  const isInstructor = ['instructor', 'admin', 'co-instructor'].includes(req.user?.role);
  const isEnrolled   = req.enrollment; // set by checkEnrollment middleware

  if (!isInstructor && !isEnrolled && !lesson.isFree) {
    lesson.content?.video && delete lesson.content.video.url;
    lesson.content?.article && delete lesson.content.article.body;
  }

  res.status(200).json({ status: 'success', data: lesson });
});

exports.createLesson = catchAsync(async (req, res, next) => {
  await verifyCourseOwner(req.params.courseId, req.user._id);

  const lesson = await Lesson.create({
    ...req.body,
    section:   req.params.sectionId,
    course:    req.params.courseId,
    createdBy: req.user._id
  });

  await Section.findByIdAndUpdate(req.params.sectionId, { $inc: { totalLessons: 1 } });
  await Course.findByIdAndUpdate(req.params.courseId,   { $inc: { totalLessons: 1 } });

  res.status(201).json({ status: 'success', data: lesson });
});

exports.uploadLessonVideo = catchAsync(async (req, res, next) => {
  await promisifyUpload(uploadVideo)(req, res);
  if (!req.file) return next(new AppError('Please upload a video file.', 400));

  const lesson = await Lesson.findByIdAndUpdate(
    req.params.lessonId,
    {
      'content.video.url':      req.file.path,
      'content.video.provider': 'cloudinary',
      duration:                 req.body.duration || 0
    },
    { new: true }
  );
  if (!lesson) return next(new AppError('Lesson not found.', 404));

  res.status(200).json({ status: 'success', data: { videoUrl: lesson.content.video.url } });
});

exports.updateLesson = catchAsync(async (req, res, next) => {
  await verifyCourseOwner(req.params.courseId, req.user._id);

  const lesson = await Lesson.findOneAndUpdate(
    { _id: req.params.lessonId, course: req.params.courseId },
    { ...req.body, lastModifiedBy: req.user._id },
    { new: true, runValidators: true }
  );
  if (!lesson) return next(new AppError('Lesson not found.', 404));
  res.status(200).json({ status: 'success', data: lesson });
});

exports.deleteLesson = catchAsync(async (req, res, next) => {
  await verifyCourseOwner(req.params.courseId, req.user._id);

  const lesson = await Lesson.findOneAndUpdate(
    { _id: req.params.lessonId, course: req.params.courseId },
    { isDeleted: true },
    { new: true }
  );
  if (!lesson) return next(new AppError('Lesson not found.', 404));

  await Section.findByIdAndUpdate(lesson.section, { $inc: { totalLessons: -1 } });
  await Course.findByIdAndUpdate(req.params.courseId, { $inc: { totalLessons: -1 } });

  res.status(204).json({ status: 'success', data: null });
});

// Reorder lessons drag-and-drop
exports.reorderLessons = catchAsync(async (req, res, next) => {
  await verifyCourseOwner(req.params.courseId, req.user._id);

  // Body: { lessons: [{ id, order }, ...] }
  const { lessons } = req.body;
  if (!Array.isArray(lessons)) return next(new AppError('Provide lessons array with id and order.', 400));

  const bulkOps = lessons.map(({ id, order }) => ({
    updateOne: { filter: { _id: id, course: req.params.courseId }, update: { $set: { order } } }
  }));

  await Lesson.bulkWrite(bulkOps, { ordered: false });
  res.status(200).json({ status: 'success', message: 'Lessons reordered.' });
});