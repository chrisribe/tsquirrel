const { getPhotoUrls, uploadFilesToS3, deletePhotoFromS3, uploadQRCodeToS3 } = require('../services/s3Service');
const QRCode = require('qrcode');

// Simple limits for free tier
const MAX_GALLERIES_PER_USER = 5;
const MAX_PHOTOS_PER_GALLERY = 100;

class GalleryController {
  constructor(galleryDAO) {
    this.galleryDAO = galleryDAO;
  }

  // ============================================
  // GALLERY CRUD (Auth Required)
  // ============================================

  async listGalleries(req, res, next) {
    try {
      const galleries = await this.galleryDAO.getUserGalleries(req.session.user.id);
      
      // Add thumbnail URLs
      const galleriesWithThumbs = galleries.map(gallery => {
        if (gallery.cover_photo_key && gallery.cover_photo_id) {
          const ext = gallery.cover_photo_key.substring(gallery.cover_photo_key.lastIndexOf('.'));
          const urls = getPhotoUrls(gallery.uuid, gallery.cover_photo_id, ext);
          return { ...gallery, thumb_url: urls.thumb };
        }
        return gallery;
      });
      
      res.respondWithTemplateOrJson({
        galleries: galleriesWithThumbs,
        pageTitle: 'My Galleries - EventGlimpse',
        pageDescription: 'Manage your event photo galleries. Create new galleries and view uploaded photos.',
        pageAssets: { css: ['gallery.css'] }
      }, 'galleries/list-page');
    } catch (error) {
      next(error);
    }
  }

  async createGallery(req, res, next) {
    try {
      const { title } = req.body;
      
      if (!title?.trim()) {
        return res.status(400).respondWithTemplateOrJson(
          { error: 'Title is required' },
          'galleries/create-form'
        );
      }

      // Check gallery limit
      const galleryCount = await this.galleryDAO.getUserGalleryCount(req.session.user.id);
      if (galleryCount >= MAX_GALLERIES_PER_USER) {
        return res.status(403).json({ 
          error: `Gallery limit reached (max ${MAX_GALLERIES_PER_USER}). Delete an existing gallery to create a new one.`,
          hint: 'Need more galleries? Let us know if a paid tier would interest you — support@event-glimpse.com'
        });
      }

      const gallery = await this.galleryDAO.createGallery(
        req.session.user.id,
        title.trim()
      );

      // Redirect to the new gallery
      res.setHeader('HX-Redirect', `/g/${gallery.uuid}`);
      res.status(201).send('');
    } catch (error) {
      next(error);
    }
  }

  async deleteGallery(req, res, next) {
    try {
      const deleted = await this.galleryDAO.deleteGallery(
        req.session.user.id,
        req.params.id
      );
      
      if (!deleted) {
        return res.status(404).json({ error: 'Gallery not found' });
      }

      res.status(200).send('');
    } catch (error) {
      next(error);
    }
  }

  async updateGalleryTitle(req, res, next) {
    try {
      const { uuid } = req.params;
      const { title } = req.body;

      if (!title?.trim()) {
        return res.status(400).json({ error: 'Title is required' });
      }

      const updated = await this.galleryDAO.updateGalleryTitle(
        uuid,
        req.session.user.id,
        title.trim()
      );

      if (!updated) {
        return res.status(404).json({ error: 'Gallery not found or not authorized' });
      }

      // Return the new title for HTMX swap
      res.status(200).send(updated.title);
    } catch (error) {
      next(error);
    }
  }

  // ============================================
  // PUBLIC GALLERY VIEW
  // ============================================

  async viewGallery(req, res, next) {
    try {
      const gallery = await this.galleryDAO.getGalleryByUuid(req.params.uuid);
      
      if (!gallery) {
        return res.status(404).respondWithTemplateOrJson(
          { error: 'Gallery not found' },
          'errors/general-error'
        );
      }

      // Generate QR code if it doesn't exist
      if (!gallery.qr_code_url) {
        try {
          // Use PUBLIC_URL env var if set (for dev testing), otherwise use request host
          const baseUrl = process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
          const galleryUrl = `${baseUrl}/g/${gallery.uuid}`;
          
          // Generate QR code as PNG buffer
          const qrCodeBuffer = await QRCode.toBuffer(galleryUrl, {
            width: 400,
            margin: 2,
            color: {
              dark: '#000000',
              light: '#FFFFFF'
            },
            type: 'png'
          });
          
          // Upload QR code to S3 and get URL
          const qrCodeUrl = await uploadQRCodeToS3(gallery.uuid, qrCodeBuffer);
          
          // Store the S3 URL in the database
          await this.galleryDAO.updateGalleryQRCode(gallery.uuid, qrCodeUrl);
          gallery.qr_code_url = qrCodeUrl;
        } catch (qrError) {
          console.error('QR code generation error:', qrError);
          // Continue without QR code if generation fails
        }
      }

      const photos = await this.galleryDAO.getPhotos(gallery.uuid);
      const isOwner = req.session?.user?.id === gallery.user_id;

      // Generate share URL
      const baseUrl = process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
      const shareUrl = `${baseUrl}/g/${gallery.uuid}`;

      // Add URLs to photos
      const photosWithUrls = photos.map(photo => {
        const ext = photo.s3_key.substring(photo.s3_key.lastIndexOf('.'));
        const urls = getPhotoUrls(gallery.uuid, photo.photo_id, ext);
        return {
          ...photo,
          thumb_url: urls.thumb,
          display_url: urls.display,
          original_url: urls.original
        };
      });

      // SEO metadata
      const photoCountText = photos.length === 1 ? '1 photo' : `${photos.length} photos`;
      const pageTitle = `${gallery.title} - EventGlimpse Gallery`;
      const pageDescription = `View and share photos from ${gallery.title}. ${photoCountText} shared. Add your own photos - no account required!`;
      const pageImage = photosWithUrls.length > 0 ? photosWithUrls[0].display_url : null;

      res.respondWithTemplateOrJson({
        gallery,
        photos: photosWithUrls,
        photoCount: photos.length,
        shareUrl,
        isOwner,
        pageTitle,
        pageDescription,
        pageImage,
        pageUrl: shareUrl,
        pageAssets: {
          css: ['gallery-showcase.css'],
          js: ['flex-images.js', 'gallery.js?v=6']
        }
      }, 'galleries/view-page');
    } catch (error) {
      next(error);
    }
  }

  // ============================================
  // PHOTO UPLOAD (Public!)
  // ============================================

  async uploadPhotos(req, res, next) {
    try {
      const { uuid } = req.params;
      const { photoMetadata } = req;

      if (!photoMetadata?.length) {
        return res.status(400).json({ error: 'No photos provided' });
      }

      // Get gallery for ownership check
      const gallery = await this.galleryDAO.getGalleryByUuid(uuid);
      if (!gallery) {
        return res.status(404).json({ error: 'Gallery not found' });
      }

      // Check photo limit
      const currentCount = await this.galleryDAO.getPhotoCount(uuid);
      if (currentCount >= MAX_PHOTOS_PER_GALLERY) {
        return res.status(403).json({ 
          error: `Photo limit reached (max ${MAX_PHOTOS_PER_GALLERY} per gallery).`,
          hint: 'Need more space? Let us know if a paid tier would interest you — support@event-glimpse.com'
        });
      }

      // Limit uploads to stay within max
      const remainingSlots = MAX_PHOTOS_PER_GALLERY - currentCount;

      // Filter out duplicates by hash
      const newPhotos = [];
      let skippedCount = 0;
      for (const photo of photoMetadata) {
        if (newPhotos.length >= remainingSlots) {
          skippedCount++;
          continue;
        }
        const isDupe = await this.galleryDAO.hashExists(uuid, photo.fileHash);
        if (!isDupe) {
          newPhotos.push(photo);
        } else {
          skippedCount++;
        }
      }

      if (newPhotos.length === 0) {
        // All photos were duplicates
        const photoCount = await this.galleryDAO.getPhotoCount(uuid);
        res.setHeader('HX-Trigger', JSON.stringify({
          uploadComplete: { added: 0, skipped: skippedCount }
        }));
        res.setHeader('X-Photos-Added', '0');
        res.setHeader('X-Photos-Skipped', String(skippedCount));
        // Return empty partial
        return res.status(200).send('');
      }

      // Upload only new photos to S3
      await uploadFilesToS3(newPhotos);

      // Save to database and track in session
      const uploadedPhotos = [];
      for (const photo of newPhotos) {
        await this.galleryDAO.addPhoto(
          uuid,
          photo.photoId,
          photo.s3Key,
          photo.width,
          photo.height,
          photo.fileHash,
          photo.takenAt
        );

        const urls = getPhotoUrls(uuid, photo.photoId, photo.extension);
        uploadedPhotos.push({
          photo_id: photo.photoId,
          thumb_url: urls.thumb,
          display_url: urls.display,
          original_url: urls.original,
          width: photo.width,
          height: photo.height
        });
        
        // Track this upload in session for delete permission
        if (!req.session.uploads) req.session.uploads = {};
        if (!req.session.uploads[uuid]) req.session.uploads[uuid] = [];
        req.session.uploads[uuid].push(photo.photoId);
      }

      // Get new count for live update
      const photoCount = await this.galleryDAO.getPhotoCount(uuid);
      const isOwner = req.session?.user?.id === gallery.user_id;

      res.setHeader('HX-Trigger', JSON.stringify({
        uploadComplete: { added: newPhotos.length, skipped: skippedCount }
      }));
      res.setHeader('X-Photos-Added', String(newPhotos.length));
      res.setHeader('X-Photos-Skipped', String(skippedCount));

      // For fetch/queue uploads, always return partial HTML
      res.status(201).render('galleries/photo-items', {
        pageData: {
          gallery,
          photos: uploadedPhotos,
          photoCount,
          isOwner,
          isUploader: true  // User just uploaded these, show delete buttons
        }
      });
    } catch (error) {
      console.error('Upload error:', error);
      res.status(500).json({ error: 'Upload failed' });
    }
  }

  // ============================================
  // PHOTO DELETE (Owner or Uploader)
  // ============================================

  async deletePhoto(req, res, next) {
    try {
      const { uuid, photoId } = req.params;
      
      const gallery = await this.galleryDAO.getGalleryByUuid(uuid);
      if (!gallery) {
        return res.status(404).json({ error: 'Gallery not found' });
      }
      
      // Check if user is gallery owner
      const isOwner = gallery.user_id === req.session?.user?.id;
      
      // Check if user uploaded this photo (stored in session)
      const sessionUploads = req.session?.uploads?.[uuid] || [];
      const isUploader = sessionUploads.includes(photoId);
      
      if (!isOwner && !isUploader) {
        return res.status(403).json({ error: 'You can only delete photos you uploaded' });
      }

      // Get photo for extension
      const photos = await this.galleryDAO.getPhotos(uuid);
      const photo = photos.find(p => p.photo_id === photoId);
      
      if (!photo) {
        return res.status(404).json({ error: 'Photo not found' });
      }

      const ext = photo.s3_key.substring(photo.s3_key.lastIndexOf('.'));

      // Delete from DB and S3
      await this.galleryDAO.deletePhoto(uuid, photoId);
      await deletePhotoFromS3(uuid, photoId, ext);
      
      // Remove from session tracking
      if (req.session?.uploads?.[uuid]) {
        req.session.uploads[uuid] = req.session.uploads[uuid].filter(id => id !== photoId);
      }

      res.status(200).json({ success: true });
    } catch (error) {
      console.error('Delete error:', error);
      res.status(500).json({ error: 'Delete failed' });
    }
  }

  // ============================================
  // PHOTO DOWNLOAD (Force download header)
  // ============================================

  async downloadPhoto(req, res, next) {
    try {
      const { photoId } = req.params;
      
      // Find photo in database to get S3 key
      const pool = this.galleryDAO.pool;
      const result = await pool.query(
        'SELECT s3_key, gallery_uuid FROM photos WHERE photo_id = $1',
        [photoId]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Photo not found' });
      }

      const { s3_key, gallery_uuid } = result.rows[0];
      const ext = s3_key.substring(s3_key.lastIndexOf('.'));
      const urls = getPhotoUrls(gallery_uuid, photoId, ext);
      
      // Fetch file from S3 and stream it to client with download header
      const filename = `eventglimpse-${photoId}${ext}`;
      const response = await fetch(urls.original);
      
      if (!response.ok) {
        return res.status(404).json({ error: 'Photo file not found' });
      }
      
      // Set headers to force download
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Type', response.headers.get('content-type') || 'image/jpeg');
      
      // Stream the response body to client
      const reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(Buffer.from(value));
      }
      res.end();
    } catch (error) {
      console.error('Download error:', error);
      res.status(500).json({ error: 'Download failed' });
    }
  }

  // ============================================
  // HASH PRE-CHECK (for duplicate detection before upload)
  // ============================================

  async checkHashes(req, res, next) {
    try {
      const { uuid } = req.params;
      const { hashes } = req.body;

      if (!hashes || !Array.isArray(hashes)) {
        return res.status(400).json({ error: 'hashes array required' });
      }

      const gallery = await this.galleryDAO.getGalleryByUuid(uuid);
      if (!gallery) {
        return res.status(404).json({ error: 'Gallery not found' });
      }

      const existingHashes = await this.galleryDAO.checkHashes(uuid, hashes);
      
      res.json({ existing: existingHashes });
    } catch (error) {
      console.error('Hash check error:', error);
      res.status(500).json({ error: 'Hash check failed' });
    }
  }
}

module.exports = GalleryController;
