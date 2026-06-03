/**
 * GalleryService - Business logic for gallery limits and validation
 */

const { TIERS, UPGRADE_TIER } = require('../config/tiers');

class GalleryService {
  /**
   * Check if user can create another gallery
   * @returns {{ allowed: boolean, error?: string, hint?: string }}
   */
  static async checkGalleryLimit(galleryDAO, userId, tier = 'free') {
    const limits = TIERS[tier] || TIERS.free;
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
    const limits = TIERS[tier] || TIERS.free;
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
    return TIERS[tier] || TIERS.free;
  }

  /**
   * Get all tier limits (for upgrade modals)
   */
  static getAllLimits() {
    return TIERS;
  }

  /**
   * Get the default upgrade tier name
   */
  static getUpgradeTier() {
    return UPGRADE_TIER;
  }
}

module.exports = GalleryService;
