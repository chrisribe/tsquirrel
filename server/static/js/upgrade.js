/**
 * Upgrade Modal - Shared logic for upgrade/payment modals
 */
const Upgrade = {
  show() {
    const modal = document.getElementById('upgradeModal');
    if (modal) {
      modal.style.display = 'flex';
      document.body.style.overflow = 'hidden';
    }
  },

  close() {
    const modal = document.getElementById('upgradeModal');
    if (modal) {
      modal.style.display = 'none';
      document.body.style.overflow = '';
    }
  },

  isOpen() {
    const modal = document.getElementById('upgradeModal');
    return modal && modal.style.display === 'flex';
  },

  /**
   * Start Stripe checkout
   * @param {string} context - 'gallery-limit' | 'zip-download'
   * @param {string} [galleryUuid] - Required for zip-download
   */
  startCheckout(context, galleryUuid) {
    // Get gallery UUID from param or from page data attribute
    const uuid = galleryUuid || document.querySelector('[data-gallery-uuid]')?.dataset.galleryUuid;
    
    if (context === 'zip-download' && !uuid) {
      this.showToast('Error: Gallery not found', 'error');
      return;
    }

    // TODO: Call Stripe checkout endpoint
    // Future implementation:
    // fetch(`/api/checkout`, {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ context, galleryUuid: uuid })
    // })
    //   .then(res => res.json())
    //   .then(data => window.location.href = data.checkoutUrl);
    
    this.showToast('Stripe checkout coming soon!');
  },

  showToast(message, type = 'info') {
    // Use Gallery.showToast if available, otherwise basic alert
    if (typeof Gallery !== 'undefined' && Gallery.showToast) {
      Gallery.showToast(message, type === 'error' ? 'warning' : 'success');
    } else {
      alert(message);
    }
  },

  /**
   * Initialize keyboard shortcuts and event listeners
   */
  init() {
    // Escape key closes modal
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && Upgrade.isOpen()) {
        Upgrade.close();
      }
    });
  }
};

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => Upgrade.init());
} else {
  Upgrade.init();
}
