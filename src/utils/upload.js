'use strict';

// utils/upload.js
// ============================================================
// UPLOAD — Multer + Cloudinary
// Different configs for: images, videos, PDFs, profile pictures
// ============================================================
// npm install multer cloudinary multer-storage-cloudinary

const multer      = require('multer');
const cloudinary  = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const AppError    = require('./appError');

// ── CLOUDINARY CONFIG ────────────────────────────────────────
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure:     true
});

// ── ALLOWED TYPES ────────────────────────────────────────────
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo'];
const ALLOWED_DOC_TYPES   = ['application/pdf', 'application/msword',
                              'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];

// ── STORAGE FACTORIES ────────────────────────────────────────

const makeImageStorage = (folder) => new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => ({
    folder:    `${process.env.APP_NAME || 'examprep'}/${folder}`,
    format:    'webp',        // convert all images to webp (smaller size)
    transformation: [{ width: 1200, crop: 'limit', quality: 'auto' }],
    public_id: `${Date.now()}-${Math.round(Math.random() * 1e9)}`
  })
});

const makeThumbnailStorage = (folder) => new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => ({
    folder:    `${process.env.APP_NAME || 'examprep'}/${folder}`,
    format:    'webp',
    transformation: [{ width: 400, height: 225, crop: 'fill', quality: 'auto' }],  // 16:9
    public_id: `${Date.now()}-${Math.round(Math.random() * 1e9)}`
  })
});

const makePDFStorage = (folder) => new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => ({
    folder:    `${process.env.APP_NAME || 'examprep'}/${folder}`,
    resource_type: 'raw',    // PDFs as raw files
    format:    'pdf',
    public_id: `${Date.now()}-${Math.round(Math.random() * 1e9)}`
  })
});

const makeVideoStorage = (folder) => new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => ({
    folder:         `${process.env.APP_NAME || 'examprep'}/${folder}`,
    resource_type:  'video',
    chunk_size:     6000000,   // 6MB chunks for large video uploads
    public_id:      `${Date.now()}-${Math.round(Math.random() * 1e9)}`
  })
});

// ── FILE FILTERS ─────────────────────────────────────────────
const imageFilter = (req, file, cb) => {
  if (ALLOWED_IMAGE_TYPES.includes(file.mimetype)) cb(null, true);
  else cb(new AppError('Only JPEG, PNG, WebP and GIF images are allowed.', 400, 'INVALID_FILE_TYPE'), false);
};

const videoFilter = (req, file, cb) => {
  if (ALLOWED_VIDEO_TYPES.includes(file.mimetype)) cb(null, true);
  else cb(new AppError('Only MP4, WebM and MOV videos are allowed.', 400, 'INVALID_FILE_TYPE'), false);
};

const pdfFilter = (req, file, cb) => {
  if (ALLOWED_DOC_TYPES.includes(file.mimetype)) cb(null, true);
  else cb(new AppError('Only PDF and Word documents are allowed.', 400, 'INVALID_FILE_TYPE'), false);
};

const anyDocFilter = (req, file, cb) => {
  const allowed = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_DOC_TYPES];
  if (allowed.includes(file.mimetype)) cb(null, true);
  else cb(new AppError('Unsupported file type.', 400, 'INVALID_FILE_TYPE'), false);
};

// ── MULTER INSTANCES ─────────────────────────────────────────

// Profile picture upload (single image, max 5MB)
const uploadProfilePicture = multer({
  storage:  makeImageStorage('profiles'),
  fileFilter: imageFilter,
  limits:   { fileSize: 5 * 1024 * 1024 }
}).single('profilePicture');

// Course/batch thumbnail (single image, max 5MB)
const uploadThumbnail = multer({
  storage:  makeThumbnailStorage('thumbnails'),
  fileFilter: imageFilter,
  limits:   { fileSize: 5 * 1024 * 1024 }
}).single('thumbnail');

// Banner image (single image, max 8MB)
const uploadBanner = multer({
  storage:  makeImageStorage('banners'),
  fileFilter: imageFilter,
  limits:   { fileSize: 8 * 1024 * 1024 }
}).single('bannerImage');

// Lesson video (single video, max 500MB)
const uploadVideo = multer({
  storage:  makeVideoStorage('lessons'),
  fileFilter: videoFilter,
  limits:   { fileSize: 500 * 1024 * 1024 }
}).single('video');

// PDF notes / study material (single PDF, max 50MB)
const uploadPDF = multer({
  storage:  makePDFStorage('notes'),
  fileFilter: pdfFilter,
  limits:   { fileSize: 50 * 1024 * 1024 }
}).single('file');

// Multiple assignment attachments (up to 5 files, 10MB each)
const uploadAssignmentFiles = multer({
  storage:  makePDFStorage('assignments'),
  fileFilter: anyDocFilter,
  limits:   { fileSize: 10 * 1024 * 1024, files: 5 }
}).array('attachments', 5);

// Question image (for mock test questions)
const uploadQuestionImage = multer({
  storage:  makeImageStorage('questions'),
  fileFilter: imageFilter,
  limits:   { fileSize: 3 * 1024 * 1024 }
}).single('image');

// ── PROMISE WRAPPERS ─────────────────────────────────────────
// Converts multer callback-style to async/await

const promisifyUpload = (uploadFn) => (req, res) =>
  new Promise((resolve, reject) => {
    uploadFn(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE')  reject(new AppError('File is too large.', 400, 'FILE_TOO_LARGE'));
        else if (err.code === 'LIMIT_FILE_COUNT') reject(new AppError('Too many files.', 400, 'TOO_MANY_FILES'));
        else reject(new AppError(`Upload error: ${err.message}`, 400));
      } else if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });

// ── CLOUDINARY HELPERS ───────────────────────────────────────

/**
 * Delete a file from Cloudinary by public_id
 */
const deleteFromCloudinary = async (publicId, resourceType = 'image') => {
  if (!publicId) return;
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
  } catch (err) {
    // Non-fatal — log and continue
    const logger = require('./logger');
    logger.warn('Cloudinary delete failed', { publicId, error: err.message });
  }
};

/**
 * Extract Cloudinary public_id from a URL
 */
const getPublicIdFromUrl = (url) => {
  if (!url) return null;
  const parts = url.split('/');
  const file  = parts[parts.length - 1];
  return file.split('.')[0];
};

// ── EXPORTS ──────────────────────────────────────────────────
module.exports = {
  // Multer instances
  uploadProfilePicture,
  uploadThumbnail,
  uploadBanner,
  uploadVideo,
  uploadPDF,
  uploadAssignmentFiles,
  uploadQuestionImage,

  // Promise wrappers
  promisifyUpload,

  // Cloudinary utils
  deleteFromCloudinary,
  getPublicIdFromUrl,
  cloudinary
};