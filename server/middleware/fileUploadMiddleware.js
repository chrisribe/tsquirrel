const { imageSize } = require('image-size');
const multer = require('multer');
const crypto = require('crypto');
const path = require('path');

// ============================================================================
// Configuration
// ============================================================================

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_FILES = 8; // Limit to prevent Lambda memory issues
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
    if (err) {
      // Handle Multer errors with user-friendly messages
      if (err.code === 'LIMIT_FILE_COUNT' || err.message === 'Too many files') {
        return res.status(400).json({ 
          error: `Too many files. Please select up to ${MAX_FILES} photos at a time.` 
        });
      }
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ 
          error: 'File too large. Maximum size is 10MB per photo.' 
        });
      }
      return next(err);
    }

    req.photoMetadata = [];
    
    if (req.files?.length) {
      const galleryUuid = req.params.uuid;
      
      req.files.forEach((file) => {
        const photoId = crypto.randomUUID();
        const extension = path.extname(file.originalname);
        const dims = getImageDimensions(file.buffer, file.originalname);
        const fileHash = crypto.createHash('md5').update(file.buffer).digest('hex');
        
        req.photoMetadata.push({
          photoId,
          originalName: file.originalname,
          s3Key: `uploads/${galleryUuid}/${photoId}${extension}`,
          extension,
          width: dims.width,
          height: dims.height,
          buffer: file.buffer,
          mimetype: file.mimetype,
          fileHash
        });
      });
    }

    next();
  });
}

module.exports = { extractDimensions };
