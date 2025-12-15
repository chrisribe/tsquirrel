const { imageSize } = require('image-size');
const multer = require('multer');
const crypto = require('crypto');
const path = require('path');

// ============================================================================
// Configuration
// ============================================================================

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_FILES = 10;
const ALLOWED_TYPES = /jpeg|jpg|png/;

// ============================================================================
// Helpers
// ============================================================================

function getImageDimensions(buffer, filename) {
  try {
    const dims = imageSize(buffer);
    return { width: dims.width || 400, height: dims.height || 300 };
  } catch {
    console.warn(`Could not get dimensions for ${filename}`);
    return { width: 400, height: 300 };
  }
}

// ============================================================================
// Middleware
// ============================================================================

function extractDimensions(req, res, next) {
  const upload = multer({
    storage: multer.memoryStorage(),
    fileFilter: (req, file, cb) => {
      const ext = ALLOWED_TYPES.test(path.extname(file.originalname).toLowerCase());
      const mime = ALLOWED_TYPES.test(file.mimetype);
      cb(null, ext && mime);
    },
    limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILES }
  }).array('photoFile', MAX_FILES);

  upload(req, res, (err) => {
    if (err) return next(err);

    req.photoMetadata = [];
    
    if (req.files?.length) {
      const galleryUuid = req.params.uuid;
      
      req.files.forEach((file) => {
        const photoId = crypto.randomUUID();
        const extension = path.extname(file.originalname);
        const dims = getImageDimensions(file.buffer, file.originalname);
        
        req.photoMetadata.push({
          photoId,
          originalName: file.originalname,
          s3Key: `uploads/${galleryUuid}/${photoId}${extension}`,
          extension,
          width: dims.width,
          height: dims.height,
          buffer: file.buffer,
          mimetype: file.mimetype
        });
      });
    }

    next();
  });
}

module.exports = { extractDimensions };
