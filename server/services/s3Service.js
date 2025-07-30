const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

// ============================================================================
// Configuration
// ============================================================================

const s3 = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1'
});

const BUCKET_NAME = process.env.S3_BUCKET_NAME || 'eventglimpse';

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generates URLs for different photo variants
 * @param {string} eventUuid - Event UUID
 * @param {string} photoId - Photo ID
 * @param {string} extension - File extension
 * @param {string} s3Key - Optional S3 key for uploaded file
 * @returns {Object} URLs object with different variants
 */
function getPhotoUrls(eventUuid, photoId, extension, s3Key = null) {
  const baseUrl = `https://${BUCKET_NAME}.s3.amazonaws.com`;
  return {
    thumb: `${baseUrl}/thumbs/${eventUuid}/${photoId}${extension}`,
    display: `${baseUrl}/display/${eventUuid}/${photoId}${extension}`,
    original: `${baseUrl}/originals/${eventUuid}/${photoId}${extension}`,
    uploaded: s3Key ? `${baseUrl}/${s3Key}` : `${baseUrl}/uploads/${eventUuid}/${photoId}${extension}`
  };
}

// ============================================================================
// S3 Upload Functions
// ============================================================================

/**
 * Uploads processed files to S3 bucket
 * @param {Array} photoMetadata - Array of photo metadata objects
 * @returns {Promise} Promise that resolves when all uploads complete
 */
async function uploadFilesToS3(photoMetadata) {
  if (!photoMetadata || photoMetadata.length === 0) {
    return;
  }

  const uploadPromises = photoMetadata.map(async (photo) => {
    const uploadParams = {
      Bucket: BUCKET_NAME,
      Key: photo.s3Key,
      Body: photo.buffer,
      ContentType: photo.mimetype
    };

    try {
      await s3.send(new PutObjectCommand(uploadParams));
      console.log(`Successfully uploaded ${photo.originalName} to S3`);
    } catch (error) {
      console.error(`Failed to upload ${photo.originalName} to S3:`, error);
      throw error;
    }
  });

  await Promise.all(uploadPromises);
}

// ============================================================================
// Module Exports
// ============================================================================

module.exports = {
  uploadFilesToS3,
  getPhotoUrls
};
