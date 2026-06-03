const { getPhotoUrls, uploadFilesToS3 } = require('./s3Service');

/**
 * Photo processing service
 */
class PhotoService {
  /**
   * Add display URLs to photo objects
   * @param {Array} photos - Array of photo objects with s3_key, photo_id
   * @param {string} galleryUuid - Gallery UUID
   * @returns {Array} - Photos with thumb_url, display_url, original_url added
   */
  static addUrls(photos, galleryUuid) {
    return photos.map(photo => {
      const ext = photo.s3_key.substring(photo.s3_key.lastIndexOf('.'));
      const urls = getPhotoUrls(galleryUuid, photo.photo_id, ext);
      return {
        ...photo,
        thumb_url: urls.thumb,
        display_url: urls.display,
        original_url: urls.original
      };
    });
  }

  /**
   * Filter out duplicate photos by hash
   * @param {Object} galleryDAO - Gallery DAO instance
   * @param {string} uuid - Gallery UUID
   * @param {Array} photos - Photos with fileHash property
   * @param {number} maxSlots - Maximum photos allowed
   * @returns {Object} - { newPhotos: [], skippedCount: number }
   */
  static async filterDuplicates(galleryDAO, uuid, photos, maxSlots) {
    const newPhotos = [];
    let skippedCount = 0;

    for (const photo of photos) {
      if (newPhotos.length >= maxSlots) {
        skippedCount++;
        continue;
      }
      const isDupe = await galleryDAO.hashExists(uuid, photo.fileHash);
      if (!isDupe) {
        newPhotos.push(photo);
      } else {
        skippedCount++;
      }
    }

    return { newPhotos, skippedCount };
  }

  /**
   * Process uploads: upload to S3, save to DB, track in session
   * @param {Object} galleryDAO - Gallery DAO instance
   * @param {string} uuid - Gallery UUID
   * @param {Array} photos - Photo metadata from middleware
   * @param {Object} session - Express session object
   * @returns {Array} - Uploaded photos with URLs
   */
  static async processUploads(galleryDAO, uuid, photos, session) {
    // Upload to S3
    await uploadFilesToS3(photos);

    const uploadedPhotos = [];

    for (const photo of photos) {
      // Save to database
      await galleryDAO.addPhoto(
        uuid,
        photo.photoId,
        photo.s3Key,
        photo.width,
        photo.height,
        photo.fileHash,
        photo.takenAt
      );

      // Build response with URLs
      const urls = getPhotoUrls(uuid, photo.photoId, photo.extension);
      uploadedPhotos.push({
        photo_id: photo.photoId,
        thumb_url: urls.thumb,
        display_url: urls.display,
        original_url: urls.original,
        width: photo.width,
        height: photo.height
      });

      // Track in session for delete permission
      if (!session.uploads) session.uploads = {};
      if (!session.uploads[uuid]) session.uploads[uuid] = [];
      session.uploads[uuid].push(photo.photoId);
    }

    return uploadedPhotos;
  }
}

module.exports = PhotoService;
