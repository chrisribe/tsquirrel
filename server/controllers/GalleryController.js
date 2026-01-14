const { getPhotoUrls, deletePhotoFromS3 } = require('../services/s3Service');
const downloadService = require('../services/DownloadService');
const PhotoService = require('../services/PhotoService');
const QRService = require('../services/QRService');

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

      // Generate QR code if needed
      const baseUrl = process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
      gallery.qr_code_url = await QRService.generateForGallery(gallery, baseUrl, this.galleryDAO);

      const photos = await this.galleryDAO.getPhotos(gallery.uuid);
      const photosWithUrls = PhotoService.addUrls(photos, gallery.uuid);
      
      const isOwner = req.session?.user?.id === gallery.user_id;
      const shareUrl = `${baseUrl}/g/${gallery.uuid}`;

      // SEO metadata
      const photoCountText = photos.length === 1 ? '1 photo' : `${photos.length} photos`;

      res.respondWithTemplateOrJson({
        gallery,
        photos: photosWithUrls,
        photoCount: photos.length,
        shareUrl,
        isOwner,
        isPaid: gallery.tier && gallery.tier !== 'free',
        pageTitle: `${gallery.title} - EventGlimpse Gallery`,
        pageDescription: `View and share photos from ${gallery.title}. ${photoCountText} shared. Add your own photos - no account required!`,
        pageImage: photosWithUrls.length > 0 ? photosWithUrls[0].display_url : null,
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

      // Filter duplicates
      const remainingSlots = MAX_PHOTOS_PER_GALLERY - currentCount;
      const { newPhotos, skippedCount } = await PhotoService.filterDuplicates(
        this.galleryDAO, uuid, photoMetadata, remainingSlots
      );

      // Set HTMX headers
      const setUploadHeaders = (added, skipped) => {
        res.setHeader('HX-Trigger', JSON.stringify({ uploadComplete: { added, skipped } }));
        res.setHeader('X-Photos-Added', String(added));
        res.setHeader('X-Photos-Skipped', String(skipped));
      };

      if (newPhotos.length === 0) {
        setUploadHeaders(0, skippedCount);
        return res.status(200).send('');
      }

      // Process uploads (S3 + DB + session tracking)
      const uploadedPhotos = await PhotoService.processUploads(
        this.galleryDAO, uuid, newPhotos, req.session
      );

      const photoCount = await this.galleryDAO.getPhotoCount(uuid);
      const isOwner = req.session?.user?.id === gallery.user_id;

      setUploadHeaders(newPhotos.length, skippedCount);

      res.status(201).render('galleries/photo-items', {
        pageData: {
          gallery,
          photos: uploadedPhotos,
          photoCount,
          isOwner,
          isUploader: true
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
      
      const photo = await this.galleryDAO.getPhotoById(photoId);
      if (!photo) {
        return res.status(404).json({ error: 'Photo not found' });
      }

      await downloadService.streamPhoto(photo, res);
    } catch (error) {
      console.error('Download error:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Download failed' });
      }
    }
  }

  // ============================================
  // DOWNLOAD ALL PHOTOS (ZIP)
  // ============================================

  async downloadAllPhotos(req, res, next) {
    try {
      const { uuid } = req.params;
      
      const gallery = await this.galleryDAO.getGalleryByUuid(uuid);
      if (!gallery) {
        return res.status(404).json({ error: 'Gallery not found' });
      }

      // Check tier - ZIP download requires paid tier
      if (gallery.tier === 'free' || !gallery.tier) {
        return res.status(402).json({ 
          error: 'ZIP download requires upgrade',
          upgradeUrl: `/g/${uuid}/upgrade`
        });
      }

      const photos = await this.galleryDAO.getPhotos(uuid);
      if (photos.length === 0) {
        return res.status(400).json({ error: 'No photos to download' });
      }

      await downloadService.streamZip(gallery, photos, res);
    } catch (error) {
      console.error('Download all error:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Download failed' });
      }
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
