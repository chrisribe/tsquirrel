import { S3Client } from '@aws-sdk/client-s3';
import multer from 'multer';
import multerS3 from 'multer-s3';
import crypto from 'crypto';
import path from 'path';

const s3 = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1'
});

const BUCKET_NAME = process.env.S3_BUCKET_NAME || 'eventglimpse';
const UPLOAD_PREFIX = 'uploads/';

export const uploadToS3 = multer({
  storage: multerS3({
    s3: s3,
    bucket: BUCKET_NAME,
    key: (req, file, cb) => {
      const eventUuid = req.params.uuid;
      const photoId = crypto.randomUUID();
      const extension = path.extname(file.originalname);
      const key = `${UPLOAD_PREFIX}${eventUuid}/${photoId}${extension}`;
      
      // Store for later use
      req.photoMetadata = {
        photoId,
        originalName: file.originalname,
        s3Key: key,
        extension
      };
      
      cb(null, key);
    }
  }),
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (extname && mimetype) {
      return cb(null, true);
    } else {
      cb(new Error('Only .png, .jpg and .jpeg format allowed!'));
    }
  },
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

export function getPhotoUrls(eventUuid, photoId, extension) {
  const baseUrl = `https://${BUCKET_NAME}.s3.amazonaws.com`;
  return {
    thumb: `${baseUrl}/thumbs/${eventUuid}/${photoId}${extension}`,
    display: `${baseUrl}/display/${eventUuid}/${photoId}${extension}`,
    original: `${baseUrl}/originals/${eventUuid}/${photoId}${extension}`
  };
}
