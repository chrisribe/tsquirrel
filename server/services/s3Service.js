const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');

// ============================================================================
// Configuration
// ============================================================================

const s3 = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1'
});

const BUCKET_NAME = process.env.S3_BUCKET_NAME || 'eventglimpse';

// ============================================================================
// URL Generation
// ============================================================================

/**
 * Generates URLs for different photo variants (thumb, display, original)
 * Lambda processes uploads into these three folders automatically
 */
function getPhotoUrls(galleryUuid, photoId, extension) {
  const baseUrl = `https://${BUCKET_NAME}.s3.amazonaws.com`;
  return {
    thumb: `${baseUrl}/thumbs/${galleryUuid}/${photoId}${extension}`,
    display: `${baseUrl}/display/${galleryUuid}/${photoId}${extension}`,
    original: `${baseUrl}/originals/${galleryUuid}/${photoId}${extension}`
  };
}

// ============================================================================
// S3 Operations
// ============================================================================

/**
 * Uploads files to S3 uploads folder (Lambda will process them)
 */
async function uploadFilesToS3(photoMetadata) {
  if (!photoMetadata?.length) return;

  const uploads = photoMetadata.map(async (photo) => {
    try {
      await s3.send(new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: photo.s3Key,
        Body: photo.buffer,
        ContentType: photo.mimetype
      }));
      console.log(`Uploaded ${photo.originalName} to S3`);
    } catch (error) {
      console.error(`Failed to upload ${photo.originalName}:`, error);
      throw error;
    }
  });

  await Promise.all(uploads);
}

/**
 * Deletes all variants of a photo from S3
 */
async function deletePhotoFromS3(galleryUuid, photoId, extension) {
  const variants = ['thumbs', 'display', 'originals', 'uploads'];
  
  const deletes = variants.map(async (variant) => {
    const key = `${variant}/${galleryUuid}/${photoId}${extension}`;
    try {
      await s3.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: key }));
      console.log(`Deleted ${key}`);
    } catch (error) {
      if (error.name !== 'NoSuchKey') {
        console.error(`Failed to delete ${key}:`, error);
      }
    }
  });

  await Promise.all(deletes);
}

/**
 * Uploads QR code image to S3
 * @param {string} galleryUuid - Gallery UUID for the QR code
 * @param {Buffer} qrBuffer - QR code image buffer
 * @returns {Promise<string>} Promise that resolves to the QR code URL
 */
async function uploadQRCodeToS3(galleryUuid, qrBuffer) {
  const s3Key = `qr-codes/${galleryUuid}.png`;
  
  try {
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: s3Key,
      Body: qrBuffer,
      ContentType: 'image/png'
    }));

    const qrUrl = `https://${BUCKET_NAME}.s3.amazonaws.com/${s3Key}`;
    console.log(`Successfully uploaded QR code for gallery ${galleryUuid} to S3`);
    return qrUrl;
  } catch (error) {
    console.error(`Failed to upload QR code for gallery ${galleryUuid} to S3:`, error);
    throw error;
  }
}

module.exports = {
  getPhotoUrls,
  uploadFilesToS3,
  deletePhotoFromS3,
  uploadQRCodeToS3
};
