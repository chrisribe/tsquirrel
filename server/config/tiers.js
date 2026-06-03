/**
 * Tier Configuration - Single source of truth
 * 
 * Cost driver = total photos (S3 + Lambda), galleries are cheap (just DB rows)
 */

const TIERS = {
  free: {
    name: 'Free',
    maxGalleries: 3,
    maxPhotosPerGallery: 200,
    retentionDays: 14,
    zipDownload: true,
    // Payment (not purchasable)
    price: 0,
    amount: 0,
    description: null
  },
  event: {
    name: 'Event Tier',
    maxGalleries: 10,
    maxPhotosPerGallery: 2000,
    retentionDays: 365, // 1 year
    zipDownload: true,
    // Payment
    price: 5,
    amount: 500, // cents
    description: '10 galleries, 2000 photos each, 1 year retention, ZIP download'
  },
  partypack: {
    name: 'Party Pack',
    maxGalleries: 100, // "unlimited"
    maxPhotosPerGallery: 2000,
    retentionDays: 365, // 1 year
    zipDownload: true,
    // Payment
    price: 12,
    amount: 1200, // cents
    description: 'Unlimited galleries, 2000 photos each, 1 year retention, ZIP download'
  }
};

// Default upgrade tier (what free users upgrade to)
const UPGRADE_TIER = 'event';

// Purchasable tiers (exclude free)
const PURCHASABLE_TIERS = ['event', 'partypack'];

module.exports = {
  TIERS,
  UPGRADE_TIER,
  PURCHASABLE_TIERS
};
