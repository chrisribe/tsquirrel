const { getPhotoUrls, uploadFilesToS3, deletePhotoFromS3 } = require('../services/s3Service');

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

      const photos = await this.galleryDAO.getPhotos(gallery.uuid);
      const isOwner = req.session?.user?.id === gallery.user_id;

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

      res.respondWithTemplateOrJson({
        gallery,
        photos: photosWithUrls,
        photoCount: photos.length,
        isOwner,
        pageAssets: {
          css: ['gallery.css'],
          js: ['gallery.js']
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

      // Upload to S3
      await uploadFilesToS3(photoMetadata);

      // Save to database
      const uploadedPhotos = [];
      for (const photo of photoMetadata) {
        await this.galleryDAO.addPhoto(
          uuid,
          photo.photoId,
          photo.s3Key,
          photo.width,
          photo.height
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
      }

      // Get new count for live update
      const photoCount = await this.galleryDAO.getPhotoCount(uuid);
      const isOwner = req.session?.user?.id === gallery.user_id;

      res.status(201).respondWithTemplateOrJson({
        gallery,
        photos: uploadedPhotos,
        photoCount,
        isOwner
      }, 'galleries/photo-items');
    } catch (error) {
      console.error('Upload error:', error);
      res.status(500).json({ error: 'Upload failed' });
    }
  }

  // ============================================
  // PHOTO DELETE (Owner Only)
  // ============================================

  async deletePhoto(req, res, next) {
    try {
      const { uuid, photoId } = req.params;
      
      // Verify ownership
      const gallery = await this.galleryDAO.getGalleryByUuid(uuid);
      if (!gallery || gallery.user_id !== req.session?.user?.id) {
        return res.status(403).json({ error: 'Not authorized' });
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

      res.status(200).json({ success: true });
    } catch (error) {
      console.error('Delete error:', error);
      res.status(500).json({ error: 'Delete failed' });
    }
  }
}

module.exports = GalleryController;
