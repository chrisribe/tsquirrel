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
   * @param {string} tier - 'event' | 'party'
   */
  startCheckout(tier) {
    // Get payment link from button data attribute
    const paymentLink = document.querySelector(`[data-stripe-${tier}]`)?.dataset[`stripe${tier.charAt(0).toUpperCase() + tier.slice(1)}`];
    
    if (!paymentLink) {
      this.showToast('Payment link not configured', 'error');
      return;
    }

    // Get user email to pre-fill Stripe checkout (prevents wrong user upgrade)
    const userEmail = document.querySelector('[data-user-email]')?.dataset.userEmail;
    
    // Build final URL with pre-filled email
    const url = new URL(paymentLink);
    if (userEmail) {
      url.searchParams.set('prefilled_email', userEmail);
    }

    // Redirect to Stripe payment page
    window.location.href = url.toString();
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
