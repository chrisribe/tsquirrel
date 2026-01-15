/**
 * GalleryService - Business logic for gallery limits and validation
 */

// Tier limits configuration (aligned with STRATEGY.md pricing)
const LIMITS = {
  free: {
    maxGalleries: 1,
    maxPhotosPerGallery: 50,
    retentionDays: 7,
    zipDownload: false,
    price: 0
  },
  event: {
    maxGalleries: 2,
    maxPhotosPerGallery: 500,
    retentionDays: 90,
    zipDownload: true,
    price: 5
  },
  partypack: {
    maxGalleries: 5,
    maxPhotosPerGallery: 500,
    retentionDays: 90,
    zipDownload: true,
    price: 12
  }
};

// Default upgrade tier (what free users upgrade to)
const UPGRADE_TIER = 'event';

class GalleryService {
  /**
   * Check if user can create another gallery
   * @returns {{ allowed: boolean, error?: string, hint?: string }}
   */
  static async checkGalleryLimit(galleryDAO, userId, tier = 'free') {
    const limits = LIMITS[tier] || LIMITS.free;
    const count = await galleryDAO.getUserGalleryCount(userId);
    
    if (count >= limits.maxGalleries) {
      return {
        allowed: false,
        error: `Gallery limit reached (max ${limits.maxGalleries}). Delete an existing gallery to create a new one.`,
        hint: 'Need more galleries? Let us know if a paid tier would interest you — support@event-glimpse.com'
      };
    }
    
    return { allowed: true, currentCount: count };
  }

  /**
   * Check if gallery can accept more photos
   * @returns {{ allowed: boolean, remainingSlots: number, error?: string, hint?: string }}
   */
  static async checkPhotoLimit(galleryDAO, uuid, tier = 'free') {
    const limits = LIMITS[tier] || LIMITS.free;
    const count = await galleryDAO.getPhotoCount(uuid);
    const remainingSlots = limits.maxPhotosPerGallery - count;
    
    if (count >= limits.maxPhotosPerGallery) {
      return {
        allowed: false,
        remainingSlots: 0,
        error: `Photo limit reached (max ${limits.maxPhotosPerGallery} per gallery).`,
        hint: 'Need more space? Let us know if a paid tier would interest you — support@event-glimpse.com'
      };
    }
    
    return { allowed: true, remainingSlots, currentCount: count };
  }

  /**
   * Get limits for a tier
   */
  static getLimits(tier = 'free') {
    return LIMITS[tier] || LIMITS.free;
  }

  /**
   * Get all tier limits (for upgrade modals)
   */
  static getAllLimits() {
    return LIMITS;
  }

  /**
   * Get the default upgrade tier name
   */
  static getUpgradeTier() {
    return UPGRADE_TIER;
  }
}

module.exports = GalleryService;
