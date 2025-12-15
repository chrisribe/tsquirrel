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

  // After upload completes
  onUploadComplete(event) {
    document.getElementById('uploadStatus').style.display = 'none';
    
    // Show success feedback
    if (event.detail.successful) {
      this.showToast('Photos uploaded! ✓');
    }
  },

  // Simple toast notification
  showToast(message) {
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed;
      bottom: 2rem;
      left: 50%;
      transform: translateX(-50%);
      background: #333;
      color: white;
      padding: 1rem 2rem;
      border-radius: 0.5rem;
      z-index: 1001;
      animation: fadeIn 0.3s ease;
    `;
    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 2000);
  },

  // Lightbox
  openLightbox(displayUrl, originalUrl) {
    const lightbox = document.getElementById('lightbox');
    const img = document.getElementById('lightboxImg');
    const download = document.getElementById('lightboxDownload');
    
    img.src = displayUrl;
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

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    Gallery.closeLightbox();
  }
});
