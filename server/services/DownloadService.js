const archiver = require('archiver');
const { Readable } = require('stream');
const { getPhotoUrls } = require('./s3Service');

/**
 * DownloadService - Handles photo download operations
 * Streams files directly without buffering in memory
 */
class DownloadService {
  
  /**
   * Stream a single photo to response with download headers
   * @param {Object} photo - Photo record with s3_key and gallery_uuid
   * @param {Response} res - Express response object
   */
  async streamPhoto(photo, res) {
    const ext = photo.s3_key.substring(photo.s3_key.lastIndexOf('.'));
    const urls = getPhotoUrls(photo.gallery_uuid, photo.photo_id, ext);
    
    const response = await fetch(urls.original);
    if (!response.ok) {
      throw new Error('Photo file not found');
    }
    
    const filename = `eventglimpse-${photo.photo_id}${ext}`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', response.headers.get('content-type') || 'image/jpeg');
    
    // Stream response body to client
    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
    res.end();
  }

  /**
   * Stream multiple photos as a ZIP archive
   * Photos are streamed directly from S3 → archiver → response (no buffering)
   * @param {Object} gallery - Gallery record with uuid and title
   * @param {Array} photos - Array of photo records
   * @param {Response} res - Express response object
   */
  async streamZip(gallery, photos, res) {
    // Sanitize gallery title for filename
    const safeName = gallery.title.replace(/[^a-z0-9]/gi, '-').toLowerCase().slice(0, 50);
    const filename = `${safeName}-photos.zip`;

    // Set headers for ZIP download
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Create streaming ZIP archive (compression level 5 = balanced speed/size)
    const archive = archiver('zip', { zlib: { level: 5 } });
    
    archive.on('error', (err) => {
      console.error('Archive error:', err);
      if (!res.headersSent) {
        throw err;
      }
    });

    // Pipe archive directly to response
    archive.pipe(res);

    // Stream each photo into archive
    let photoIndex = 1;
    for (const photo of photos) {
      const ext = photo.s3_key.substring(photo.s3_key.lastIndexOf('.'));
      const urls = getPhotoUrls(gallery.uuid, photo.photo_id, ext);
      
      try {
        const response = await fetch(urls.original);
        if (response.ok) {
          // Convert web stream to Node.js stream (no buffering)
          const nodeStream = Readable.fromWeb(response.body);
          const photoName = `${String(photoIndex).padStart(3, '0')}-${photo.photo_id}${ext}`;
          archive.append(nodeStream, { name: photoName });
          photoIndex++;
        }
      } catch (fetchError) {
        console.error(`Failed to fetch photo ${photo.photo_id}:`, fetchError);
        // Continue with other photos
      }
    }

    await archive.finalize();
  }
}

module.exports = new DownloadService();
