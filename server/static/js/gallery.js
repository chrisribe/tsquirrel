/**
 * Gallery JS - Minimal functionality for friction-free photo sharing
 */
const Gallery = {
  
  // Retry loading images that fail (Lambda processing delay)
  // Replace the img element entirely to clear browser's broken state
  retryImage(img, retries = 5) {
    if (retries <= 0) {
      img.alt = '⚠️';
      return;
    }
    
    setTimeout(() => {
      // Create fresh img element to clear broken state
      const newImg = document.createElement('img');
      const baseUrl = img.src.split('?')[0]; // Remove any existing retry params
      newImg.src = baseUrl + '?retry=' + Date.now();
      newImg.alt = img.alt;
      newImg.loading = 'lazy';
      newImg.onerror = () => this.retryImage(newImg, retries - 1);
      newImg.onload = () => newImg.classList.add('loaded');
      
      // Copy click handler if present
      if (img.onclick) newImg.onclick = img.onclick;
      
      // Replace old img with new one
      img.parentNode.replaceChild(newImg, img);
    }, 2000); // Wait 2 seconds between retries
  },

  // File selection handler - auto-submit form
  onFilesSelected(input) {
    if (input.files.length > 0) {
      document.getElementById('uploadStatus').style.display = 'block';
      document.getElementById('uploadForm').requestSubmit();
    }
  },

  // After upload completes - hide status
  onUploadComplete(event) {
    document.getElementById('uploadStatus').style.display = 'none';
  },

  // Handle upload result via HX-Trigger event
  onUploadResult(event) {
    const { added, skipped } = event.detail;
    
    // Track upload success in Google Analytics
    if (added > 0) {
      this.trackUploadSuccess(added, skipped);
    }
    
    if (added > 0 && skipped > 0) {
      this.showToast(`${added} added, ${skipped} duplicate${skipped > 1 ? 's' : ''} skipped`);
    } else if (added > 0) {
      this.showToast('Photos uploaded! ✓');
    } else if (skipped > 0) {
      this.showToast(`${skipped} duplicate${skipped > 1 ? 's' : ''} skipped`, 'warning');
    }
  },

  // Track photo upload success in Google Analytics
  trackUploadSuccess(photosAdded, photosSkipped) {
    if (typeof gtag === 'function') {
      gtag('event', 'photo_upload', {
        event_category: 'Gallery',
        event_label: 'Upload Success',
        photos_added: photosAdded,
        photos_skipped: photosSkipped,
        total_photos: photosAdded + photosSkipped
      });
    }
  },

  // Simple toast notification
  showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.textContent = message;
    const bgColor = type === 'warning' ? '#b45309' : '#333';
    toast.style.cssText = `
      position: fixed;
      bottom: 2rem;
      left: 0;
      right: 0;
      margin: 0 auto;
      width: fit-content;
      background: ${bgColor};
      color: white;
      padding: 1rem 2rem;
      border-radius: 0.5rem;
      z-index: 1001;
      opacity: 0;
      transition: opacity 0.3s ease;
    `;
    document.body.appendChild(toast);
    
    // Trigger fade in after append
    requestAnimationFrame(() => {
      toast.style.opacity = '1';
    });
    
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  },

  // Lightbox state
  currentPhotoIndex: -1,
  photoUrls: [],

  // Lightbox
  openLightbox(displayUrl, originalUrl) {
    const lightbox = document.getElementById('lightbox');
    const img = document.getElementById('lightboxImg');
    const download = document.getElementById('lightboxDownload');
    
    // Build photo URLs array for navigation
    this.photoUrls = Array.from(document.querySelectorAll('.photo-item img')).map(img => {
      const onclick = img.getAttribute('onclick');
      if (!onclick) return null;
      const match = onclick.match(/Gallery\.openLightbox\('([^']+)',\s*'([^']+)'\)/);
      return match ? { display: match[1], original: match[2] } : null;
    }).filter(Boolean);
    
    // Find current index
    this.currentPhotoIndex = this.photoUrls.findIndex(p => p.original === originalUrl);
    
    // Try original first in background, show display only on error
    this.loadOriginalImage(img, originalUrl, displayUrl);
    
    download.href = originalUrl;
    lightbox.style.display = 'flex';
    
    // Show/hide nav arrows
    this.updateNavArrows();
    
    document.body.style.overflow = 'hidden';
  },

  loadOriginalImage(img, originalUrl, displayUrl, retries = 5) {
    // Try loading original in hidden Image
    const testImg = new Image();
    testImg.src = originalUrl;
    
    testImg.onload = () => {
      // Success - show original
      img.src = originalUrl;
      img.style.opacity = '1';
      img.style.cursor = '';
    };
    
    testImg.onerror = () => {
      if (retries > 0) {
        // Retry original after delay
        setTimeout(() => {
          this.loadOriginalImage(img, originalUrl + '?retry=' + Date.now(), displayUrl, retries - 1);
        }, 2000);
      } else {
        // All retries failed - fallback to display version
        img.src = displayUrl;
        img.style.opacity = '1';
        img.style.cursor = '';
      }
    };
    
    // Show loading state while testing
    img.style.opacity = '0.5';
    img.style.cursor = 'wait';
  },



  updateNavArrows() {
    const prevBtn = document.getElementById('lightboxPrev');
    const nextBtn = document.getElementById('lightboxNext');
    if (prevBtn) prevBtn.style.display = this.currentPhotoIndex > 0 ? 'flex' : 'none';
    if (nextBtn) nextBtn.style.display = this.currentPhotoIndex < this.photoUrls.length - 1 ? 'flex' : 'none';
  },

  prevPhoto() {
    if (this.currentPhotoIndex > 0) {
      this.currentPhotoIndex--;
      this.showCurrentPhoto();
    }
  },

  nextPhoto() {
    if (this.currentPhotoIndex < this.photoUrls.length - 1) {
      this.currentPhotoIndex++;
      this.showCurrentPhoto();
    }
  },

  showCurrentPhoto() {
    const photo = this.photoUrls[this.currentPhotoIndex];
    const img = document.getElementById('lightboxImg');
    const download = document.getElementById('lightboxDownload');
    
    // Try original first, fallback to display on error
    this.loadOriginalImage(img, photo.original, photo.display);
    
    download.href = photo.original;
    this.updateNavArrows();
  },

  closeLightbox() {
    document.getElementById('lightbox').style.display = 'none';
    document.body.style.overflow = '';
    this.currentPhotoIndex = -1;
  },

  // Delete photo
  async deletePhoto(galleryUuid, photoId, button) {
    if (!confirm('Delete this photo?')) return;
    
    try {
      const response = await fetch(`/g/${galleryUuid}/photos/${photoId}`, {
        method: 'DELETE'
      });
      
      if (response.ok) {
        const item = button.closest('.photo-item');
        item.style.transform = 'scale(0)';
        setTimeout(() => item.remove(), 200);
        
        // Update count
        const counter = document.getElementById('photoCount');
        counter.textContent = parseInt(counter.textContent) - 1;
      }
    } catch (error) {
      alert('Failed to delete photo');
    }
  },

  // Share modal
  toggleShare() {
    const modal = document.getElementById('shareModal');
    if (modal) {
      modal.style.display = 'flex';
      document.body.style.overflow = 'hidden';
    }
  },

  closeShare() {
    const modal = document.getElementById('shareModal');
    if (modal) {
      modal.style.display = 'none';
      document.body.style.overflow = '';
    }
  },

  copyLink() {
    const input = document.getElementById('shareUrl');
    const url = input.value;
    
    // Use modern Clipboard API
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(() => {
        this.showToast('Link copied! ✓');
      }).catch(() => {
        // Fallback to old method
        this.fallbackCopy(input);
      });
    } else {
      // Fallback for older browsers
      this.fallbackCopy(input);
    }
  },

  copyMobileLink() {
    const input = document.getElementById('mobileShareUrl');
    const url = input.value;
    
    // Use modern Clipboard API
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(() => {
        this.showToast('Link copied! ✓');
      }).catch(() => {
        // Fallback to old method
        this.fallbackCopy(input);
      });
    } else {
      // Fallback for older browsers
      this.fallbackCopy(input);
    }
  },

  fallbackCopy(input) {
    input.select();
    try {
      document.execCommand('copy');
      this.showToast('Link copied! ✓');
    } catch (err) {
      this.showToast('Failed to copy', 'warning');
    }
  }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    const lightbox = document.getElementById('lightbox');
    const shareModal = document.getElementById('shareModal');
    
    if (lightbox && lightbox.style.display === 'flex') {
      if (e.key === 'Escape') {
        Gallery.closeLightbox();
      } else if (e.key === 'ArrowLeft') {
        Gallery.prevPhoto();
      } else if (e.key === 'ArrowRight') {
        Gallery.nextPhoto();
      }
    } else if (shareModal && shareModal.style.display === 'flex') {
      if (e.key === 'Escape') {
        Gallery.closeShare();
      }
    }
  });

  // Listen for HX-Trigger uploadComplete event
  document.body.addEventListener('uploadComplete', (e) => {
    Gallery.onUploadResult(e);
  });
});
