const { imageSize } = require('image-size');
const multer = require('multer');
const crypto = require('crypto');
const path = require('path');

// ============================================================================
// Configuration
// ============================================================================

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_FILES = 10;
const ALLOWED_FILE_TYPES = /jpeg|jpg|png/;
const DEFAULT_DIMENSIONS = { width: 400, height: 300 };
const UPLOAD_PREFIX = 'uploads/';

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Validates if file type is allowed
 * @param {string} filename - Original filename
 * @param {string} mimetype - File MIME type
 * @returns {boolean} True if file type is allowed
 */
function isValidFileType(filename, mimetype) {
  const extname = ALLOWED_FILE_TYPES.test(path.extname(filename).toLowerCase());
  const mimetypeValid = ALLOWED_FILE_TYPES.test(mimetype);
  return extname && mimetypeValid;
}

/**
 * Extracts image dimensions from buffer
 * @param {Buffer} buffer - Image file buffer
 * @param {string} filename - Original filename for logging
 * @returns {Object} Dimensions object with width and height
 */
function extractImageDimensions(buffer, filename) {
  try {
    const dimensions = imageSize(buffer);
    return {
      width: dimensions.width || DEFAULT_DIMENSIONS.width,
      height: dimensions.height || DEFAULT_DIMENSIONS.height
    };
  } catch (error) {
    console.warn(`Could not extract dimensions for ${filename}:`, error.message);
    return DEFAULT_DIMENSIONS;
  }
}

/**
 * Generates photo metadata object
 * @param {Object} file - Multer file object
 * @param {string} eventUuid - Event UUID
 * @returns {Object} Photo metadata
 */
function createPhotoMetadata(file, eventUuid) {
  const photoId = crypto.randomUUID();
  const extension = path.extname(file.originalname);
  const dimensions = extractImageDimensions(file.buffer, file.originalname);
  
  return {
    photoId,
    originalName: file.originalname,
    s3Key: `${UPLOAD_PREFIX}${eventUuid}/${photoId}${extension}`,
    extension,
    width: dimensions.width,
    height: dimensions.height,
    buffer: file.buffer,
    mimetype: file.mimetype
  };
}

// ============================================================================
// Middleware Functions
// ============================================================================

/**
 * Multer middleware to handle multiple file uploads with dimension extraction
 * Stores files in memory first, extracts dimensions, then prepares metadata for upload
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object  
 * @param {Function} next - Next middleware function
 */
function extractDimensions(req, res, next) {
  const memoryUpload = multer({
    storage: multer.memoryStorage(),
    fileFilter: (req, file, cb) => {
      if (isValidFileType(file.originalname, file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error('Only .png, .jpg and .jpeg format allowed!'));
      }
    },
    limits: { 
      fileSize: MAX_FILE_SIZE,
      files: MAX_FILES
    }
  }).array('photoFile', MAX_FILES);

  memoryUpload(req, res, (err) => {
    if (err) {
      return next(err);
    }

    // Process uploaded files and extract metadata
    req.photoMetadata = [];
    if (req.files && req.files.length > 0) {
      const eventUuid = req.params.uuid;
      
      req.files.forEach((file) => {
        const metadata = createPhotoMetadata(file, eventUuid);
        req.photoMetadata.push(metadata);
      });
    }

    next();
  });
}

// ============================================================================
// Module Exports
// ============================================================================

module.exports = {
  extractDimensions
};
