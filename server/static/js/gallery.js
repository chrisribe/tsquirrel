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
    
    if (added > 0 && skipped > 0) {
      this.showToast(`${added} added, ${skipped} duplicate${skipped > 1 ? 's' : ''} skipped`);
    } else if (added > 0) {
      this.showToast('Photos uploaded! ✓');
    } else if (skipped > 0) {
      this.showToast(`${skipped} duplicate${skipped > 1 ? 's' : ''} skipped`, 'warning');
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

  // Lightbox
  openLightbox(displayUrl, originalUrl) {
    const lightbox = document.getElementById('lightbox');
    const img = document.getElementById('lightboxImg');
    const download = document.getElementById('lightboxDownload');
    
    // Use original for full quality viewing
    img.src = originalUrl;
    download.href = originalUrl;
    lightbox.style.display = 'flex';
    
    document.body.style.overflow = 'hidden';
  },

  closeLightbox() {
    document.getElementById('lightbox').style.display = 'none';
    document.body.style.overflow = '';
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
  }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      Gallery.closeLightbox();
    }
  });

  // Listen for HX-Trigger uploadComplete event
  document.body.addEventListener('uploadComplete', (e) => {
    Gallery.onUploadResult(e);
  });
});
