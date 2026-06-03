const { getPhotoUrls, deletePhotoFromS3 } = require('../services/s3Service');
const downloadService = require('../services/DownloadService');
const PhotoService = require('../services/PhotoService');
const QRService = require('../services/QRService');
const GalleryService = require('../services/GalleryService');

class GalleryController {
  constructor(galleryDAO, userDAO) {
    this.galleryDAO = galleryDAO;
    this.userDAO = userDAO;
  }

  // ============================================
  // GALLERY CRUD (Auth Required)
  // ============================================

  async listGalleries(req, res, next) {
    try {
      const galleries = await this.galleryDAO.getUserGalleries(req.session.user.id);
      
      // Refresh user data to ensure tier is current (session may be stale after admin changes)
      const freshUser = await this.userDAO.getUserById(req.session.user.id);
      if (freshUser) {
        res.locals.user = freshUser;
      }
      
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
        limits: GalleryService.getAllLimits(),
        pageTitle: 'My Galleries - EventGlimpse',
        pageDescription: 'Manage your event photo galleries. Create new galleries and view uploaded photos.',
        pageAssets: { css: ['gallery.css', 'upgrade-modal.css'], js: ['upgrade.js'] }
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

      // Fetch fresh user data to get current tier (session may be stale after admin changes)
      const freshUser = await this.userDAO.getUserById(req.session.user.id);
      const userTier = freshUser?.tier || 'free';
      
      // Check gallery limit
      const limitCheck = await GalleryService.checkGalleryLimit(this.galleryDAO, req.session.user.id, userTier);
      if (!limitCheck.allowed) {
        return res.status(403).json({ error: limitCheck.error, hint: limitCheck.hint });
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

      // Refresh logged-in user data to ensure tier is current (for upgrade modal)
      if (req.session?.user?.id) {
        const freshUser = await this.userDAO.getUserById(req.session.user.id);
        if (freshUser) {
          res.locals.user = freshUser;
        }
      }

      // Generate QR code if needed
      const baseUrl = process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
      gallery.qr_code_url = await QRService.generateForGallery(gallery, baseUrl, this.galleryDAO);

      const photos = await this.galleryDAO.getPhotos(gallery.uuid);
      const photosWithUrls = PhotoService.addUrls(photos, gallery.uuid);
      
      const isOwner = req.session?.user?.id === gallery.user_id;
      const shareUrl = `${baseUrl}/g/${gallery.uuid}`;
      
      // Get gallery owner's tier for paid features
      const owner = await this.userDAO.getUserById(gallery.user_id);
      const ownerTier = owner?.tier || 'free';
      const isPaid = ownerTier !== 'free';

      // SEO metadata
      const photoCountText = photos.length === 1 ? '1 photo' : `${photos.length} photos`;

      res.respondWithTemplateOrJson({
        gallery,
        photos: photosWithUrls,
        photoCount: photos.length,
        shareUrl,
        isOwner,
        isPaid,
        ownerTier,
        limits: GalleryService.getAllLimits(),
        pageTitle: `${gallery.title} - EventGlimpse Gallery`,
        pageDescription: `View and share photos from ${gallery.title}. ${photoCountText} shared. Add your own photos - no account required!`,
        pageImage: photosWithUrls.length > 0 ? photosWithUrls[0].display_url : null,
        pageUrl: shareUrl,
        pageAssets: {
          css: ['gallery-showcase.css', 'upgrade-modal.css'],
          js: ['flex-images.js', 'gallery.js?v=6', 'upgrade.js']
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

      // Get gallery owner's tier for photo limit
      const owner = await this.userDAO.getUserById(gallery.user_id);
      const ownerTier = owner?.tier || 'free';

      // Check photo limit
      const limitCheck = await GalleryService.checkPhotoLimit(this.galleryDAO, uuid, ownerTier);
      if (!limitCheck.allowed) {
        return res.status(402).json({ error: limitCheck.error, hint: limitCheck.hint });
      }

      // Filter duplicates
      const { newPhotos, skippedCount } = await PhotoService.filterDuplicates(
        this.galleryDAO, uuid, photoMetadata, limitCheck.remainingSlots
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

      // Get gallery owner's tier - ZIP download requires paid tier
      const owner = await this.userDAO.getUserById(gallery.user_id);
      const ownerTier = owner?.tier || 'free';
      
      if (ownerTier === 'free') {
        return res.status(402).json({ 
          error: 'ZIP download requires upgrade',
          upgradeUrl: `/g/${uuid}/upgrade`
        });
      }

      const photos = await this.galleryDAO.getPhotos(uuid);
      if (photos.length === 0) {
        return res.status(400).json({ error: 'No photos to download' });
      }

      // HEAD request = just checking access, don't stream
      if (req.method === 'HEAD') {
        return res.status(200).end();
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
