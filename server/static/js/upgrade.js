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
   * @param {string} tier - 'event' | 'partypack'
   */
  async startCheckout(tier) {
    try {
      // Call our API to create checkout session
      const res = await fetch('/payment/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to start checkout');
      }

      // Redirect to Stripe-hosted checkout page
      window.location.href = data.url;
    } catch (err) {
      console.error('Checkout error:', err);
      this.showToast(err.message || 'Failed to start checkout', 'error');
    }
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
