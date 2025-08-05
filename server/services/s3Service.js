const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');

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

/**
 * Uploads QR code image to S3
 * @param {string} eventUuid - Event UUID for the QR code
 * @param {Buffer} qrBuffer - QR code image buffer
 * @returns {Promise<string>} Promise that resolves to the QR code URL
 */
async function uploadQRCodeToS3(eventUuid, qrBuffer) {
  const s3Key = `qr-codes/${eventUuid}.png`;
  
  const uploadParams = {
    Bucket: BUCKET_NAME,
    Key: s3Key,
    Body: qrBuffer,
    ContentType: 'image/png',
    CacheControl: 'max-age=31536000' // Cache for 1 year
  };

  try {
    await s3.send(new PutObjectCommand(uploadParams));
    const qrUrl = `https://${BUCKET_NAME}.s3.amazonaws.com/${s3Key}`;
    console.log(`Successfully uploaded QR code for event ${eventUuid} to S3`);
    return qrUrl;
  } catch (error) {
    console.error(`Failed to upload QR code for event ${eventUuid} to S3:`, error);
    throw error;
  }
}

/**
 * Deletes all variants of a photo from S3
 * @param {string} eventUuid - Event UUID
 * @param {string} photoId - Photo ID
 * @param {string} extension - File extension
 * @returns {Promise} Promise that resolves when all deletions complete
 */
async function deletePhotoFromS3(eventUuid, photoId, extension) {
  const deletePromises = [];
  
  // Delete all three processed variants
  const variants = ['thumbs', 'display', 'originals'];
  
  for (const variant of variants) {
    const s3Key = `${variant}/${eventUuid}/${photoId}${extension}`;
    
    const deleteParams = {
      Bucket: BUCKET_NAME,
      Key: s3Key
    };
    
    deletePromises.push(
      s3.send(new DeleteObjectCommand(deleteParams))
        .then(() => console.log(`Deleted ${s3Key} from S3`))
        .catch(error => {
          // Log but don't fail if file doesn't exist (404 is acceptable)
          if (error.name !== 'NoSuchKey') {
            console.error(`Failed to delete ${s3Key} from S3:`, error);
          }
        })
    );
  }
  
  // Also try to delete from uploads folder (in case processing hasn't completed)
  const uploadKey = `uploads/${eventUuid}/${photoId}${extension}`;
  deletePromises.push(
    s3.send(new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: uploadKey
    }))
    .then(() => console.log(`Deleted ${uploadKey} from S3`))
    .catch(error => {
      if (error.name !== 'NoSuchKey') {
        console.error(`Failed to delete ${uploadKey} from S3:`, error);
      }
    })
  );
  
  await Promise.all(deletePromises);
}

// ============================================================================
// Module Exports
// ============================================================================

module.exports = {
  uploadFilesToS3,
  uploadQRCodeToS3,
  getPhotoUrls,
  deletePhotoFromS3
};
