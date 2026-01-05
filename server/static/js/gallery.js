/**
 * Gallery JS - Minimal functionality for friction-free photo sharing
 */
const Gallery = {
  
  // ============================================
  // Session-based photo tracking (for anonymous delete)
  // ============================================
  
  getMyPhotos(galleryUuid) {
    try {
      const key = `eventglimpse_uploads_${galleryUuid}`;
      return JSON.parse(localStorage.getItem(key) || '[]');
    } catch {
      return [];
    }
  },
  
  addMyPhoto(galleryUuid, photoId) {
    try {
      const key = `eventglimpse_uploads_${galleryUuid}`;
      const photos = this.getMyPhotos(galleryUuid);
      if (!photos.includes(photoId)) {
        photos.push(photoId);
        localStorage.setItem(key, JSON.stringify(photos));
      }
    } catch {
      // localStorage might be disabled
    }
  },
  
  removeMyPhoto(galleryUuid, photoId) {
    try {
      const key = `eventglimpse_uploads_${galleryUuid}`;
      const photos = this.getMyPhotos(galleryUuid).filter(id => id !== photoId);
      localStorage.setItem(key, JSON.stringify(photos));
    } catch {
      // localStorage might be disabled
    }
  },
  
  canDeletePhoto(galleryUuid, photoId) {
    return this.getMyPhotos(galleryUuid).includes(photoId);
  },
  
  // Show delete buttons for photos this user uploaded
  showMyDeleteButtons(galleryUuid) {
    const myPhotos = this.getMyPhotos(galleryUuid);
    myPhotos.forEach(photoId => {
      const photoItem = document.querySelector(`[data-photo-id="${photoId}"]`);
      if (photoItem && !photoItem.querySelector('.delete-btn')) {
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-btn delete-btn-mine';
        deleteBtn.innerHTML = '×';
        deleteBtn.onclick = () => Gallery.deletePhoto(galleryUuid, photoId, deleteBtn);
        photoItem.appendChild(deleteBtn);
      }
    });
  },

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

  // File selection handler - start queue upload
  onFilesSelected(input) {
    if (input.files.length > 0) {
      this.startUploadQueue(Array.from(input.files));
      input.value = ''; // Reset input for next selection
    }
  },

  // Upload queue state
  uploadQueue: [],
  uploadInProgress: false,
  uploadCancelled: false,
  uploadStats: { added: 0, skipped: 0, failed: 0 },
  activeUploads: 0,
  maxParallel: 2,  // Upload 2 at a time

  startUploadQueue(files) {
    // Filter to only image files (for folder upload)
    const imageFiles = files.filter(f => f.type.startsWith('image/'));
    
    if (imageFiles.length === 0) {
      this.showToast('No images found', 'warning');
      return;
    }
    
    this.uploadQueue = imageFiles;
    this.uploadInProgress = true;
    this.uploadCancelled = false;
    this.uploadStats = { added: 0, skipped: 0, failed: 0 };
    this.activeUploads = 0;
    this.totalToUpload = imageFiles.length;
    this.uploadedCount = 0;
    
    // Show queue UI
    document.getElementById('uploadLabel').style.display = 'none';
    document.getElementById('uploadQueue').style.display = 'block';
    document.getElementById('queueTotal').textContent = imageFiles.length;
    document.getElementById('queueCurrent').textContent = '0';
    document.getElementById('queueAdded').textContent = '0';
    document.getElementById('queueSkipped').textContent = '0';
    document.getElementById('queueProgress').value = 0;
    
    // Start parallel uploads
    for (let i = 0; i < this.maxParallel; i++) {
      this.processNextUpload();
    }
  },

  async processNextUpload() {
    if (this.uploadCancelled || this.uploadQueue.length === 0) {
      // Check if all uploads finished
      if (this.activeUploads === 0) {
        this.finishUploadQueue();
      }
      return;
    }
    
    const file = this.uploadQueue.shift();
    this.activeUploads++;
    
    try {
      const result = await this.uploadSingleFile(file);
      
      this.uploadedCount++;
      document.getElementById('queueCurrent').textContent = this.uploadedCount;
      document.getElementById('queueProgress').value = (this.uploadedCount / this.totalToUpload) * 100;
      
      if (result.added > 0) {
        this.uploadStats.added += result.added;
        document.getElementById('queueAdded').textContent = this.uploadStats.added;
        
        // Add photo to grid (strip script tags from response)
        if (result.html) {
          const cleanHtml = result.html.replace(/<script[\s\S]*?<\/script>/gi, '').trim();
          if (cleanHtml) {
            document.getElementById('photoGrid').insertAdjacentHTML('afterbegin', cleanHtml);
            
            // Track uploaded photo ID for session-based delete
            const galleryUuid = document.getElementById('uploadForm').dataset.galleryUuid;
            const match = cleanHtml.match(/data-photo-id="([^"]+)"/);
            if (match && match[1]) {
              this.addMyPhoto(galleryUuid, match[1]);
              // Show delete button on the new photo
              this.showMyDeleteButtons(galleryUuid);
            }
          }
        }
        
        // Update photo count
        const counter = document.getElementById('photoCount');
        if (counter) {
          counter.textContent = parseInt(counter.textContent) + result.added;
        }
      }
      
      if (result.skipped > 0) {
        this.uploadStats.skipped += result.skipped;
        document.getElementById('queueSkipped').textContent = this.uploadStats.skipped;
      }
    } catch (error) {
      console.error('Upload failed:', error);
      this.uploadStats.failed++;
      this.uploadedCount++;
      document.getElementById('queueCurrent').textContent = this.uploadedCount;
      document.getElementById('queueProgress').value = (this.uploadedCount / this.totalToUpload) * 100;
    }
    
    this.activeUploads--;
    
    // Process next file
    this.processNextUpload();
  },

  async uploadSingleFile(file) {
    const galleryUuid = document.getElementById('uploadForm').dataset.galleryUuid;
    const formData = new FormData();
    formData.append('photoFile', file);
    
    const response = await fetch(`/g/${galleryUuid}/photos`, {
      method: 'POST',
      body: formData,
      headers: {
        'HX-Request': 'true'  // Get partial HTML response
      }
    });
    
    if (!response.ok) {
      throw new Error('Upload failed');
    }
    
    // Parse response - server returns HTML + stats in headers
    const html = await response.text();
    const added = parseInt(response.headers.get('X-Photos-Added') || '1');
    const skipped = parseInt(response.headers.get('X-Photos-Skipped') || '0');
    
    return { html, added, skipped };
  },

  cancelQueue() {
    this.uploadCancelled = true;
    this.showToast('Upload cancelled', 'warning');
  },

  finishUploadQueue() {
    this.uploadInProgress = false;
    
    // Hide queue UI, show upload buttons
    document.getElementById('uploadQueue').style.display = 'none';
    document.getElementById('uploadLabel').style.display = 'flex';
    
    // Show summary toast
    const { added, skipped, failed } = this.uploadStats;
    if (this.uploadCancelled) {
      if (added > 0) {
        this.showToast(`Cancelled. ${added} photo${added > 1 ? 's' : ''} uploaded.`);
      }
    } else if (added > 0 && skipped > 0) {
      this.showToast(`${added} added, ${skipped} duplicate${skipped > 1 ? 's' : ''} skipped`);
    } else if (added > 0) {
      this.showToast(`${added} photo${added > 1 ? 's' : ''} uploaded! ✓`);
    } else if (skipped > 0) {
      this.showToast(`${skipped} duplicate${skipped > 1 ? 's' : ''} skipped`, 'warning');
    }
    
    if (failed > 0) {
      this.showToast(`${failed} failed to upload`, 'warning');
    }
    
    // Track in analytics
    if (added > 0) {
      this.trackUploadSuccess(added, skipped);
    }
  },

  // After upload completes - hide status and handle errors (legacy, kept for compatibility)
  onUploadComplete(event) {
    // Now handled by queue system
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
    const loading = document.getElementById('lightboxLoading');
    
    // Build photo URLs array for navigation
    this.photoUrls = Array.from(document.querySelectorAll('.photo-item img')).map(img => {
      const onclick = img.getAttribute('onclick');
      if (!onclick) return null;
      const match = onclick.match(/Gallery\.openLightbox\('([^']+)',\s*'([^']+)'\)/);
      return match ? { display: match[1], original: match[2] } : null;
    }).filter(Boolean);
    
    // Find current index
    this.currentPhotoIndex = this.photoUrls.findIndex(p => p.original === originalUrl);
    
    // Show display image directly (1600px is good for viewing)
    this.loadDisplayImage(img, loading, displayUrl);
    
    // Download button uses original via proxy
    const photoId = originalUrl.split('/').pop().split('.')[0];
    download.href = `/galleries/download/${photoId}`;
    lightbox.style.display = 'flex';
    
    // Show/hide nav arrows
    this.updateNavArrows();
    
    document.body.style.overflow = 'hidden';
  },

  loadDisplayImage(img, loading, displayUrl, retries = 5) {
    // Show loading, hide image
    loading.style.display = 'block';
    img.style.display = 'none';
    img.src = '';
    
    // Load display image (1600px - good for viewing)
    const testImg = new Image();
    testImg.src = displayUrl;
    
    testImg.onload = () => {
      loading.style.display = 'none';
      img.src = displayUrl;
      img.style.display = 'block';
    };
    
    testImg.onerror = () => {
      if (retries > 0) {
        // Retry after delay (Lambda processing)
        setTimeout(() => {
          this.loadDisplayImage(img, loading, displayUrl.split('?')[0] + '?retry=' + Date.now(), retries - 1);
        }, 2000);
      } else {
        // All retries failed
        loading.style.display = 'none';
        img.alt = '⚠️ Failed to load';
        img.style.display = 'block';
      }
    };
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
    const loading = document.getElementById('lightboxLoading');
    
    // Show display image (1600px - good for viewing)
    this.loadDisplayImage(img, loading, photo.display);
    
    // Download uses original via proxy
    const photoId = photo.original.split('/').pop().split('.')[0];
    download.href = `/galleries/download/${photoId}`;
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
        
        // Remove from localStorage tracking
        this.removeMyPhoto(galleryUuid, photoId);
      } else {
        const data = await response.json();
        this.showToast(data.error || 'Failed to delete', 'warning');
      }
    } catch (error) {
      this.showToast('Failed to delete photo', 'warning');
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
  },

  // Title editing - cached elements
  _titleElements: null,
  
  getTitleElements() {
    if (!this._titleElements) {
      this._titleElements = {
        title: document.getElementById('galleryTitle'),
        form: document.getElementById('titleEditForm'),
        input: document.getElementById('titleInput')
      };
    }
    return this._titleElements;
  },

  editTitle() {
    const { title, form, input } = this.getTitleElements();
    if (title && form) {
      title.style.display = 'none';
      form.style.display = 'flex';
      input.focus();
      input.select();
    }
  },

  cancelEditTitle() {
    const { title, form, input } = this.getTitleElements();
    if (title && form) {
      form.style.display = 'none';
      title.style.display = 'block';
      input.value = title.textContent;
    }
  },

  onTitleSaved(event) {
    const { title, form } = this.getTitleElements();
    if (event.detail.successful) {
      form.style.display = 'none';
      title.style.display = 'block';
      this.showToast('Title updated ✓');
    } else {
      this.showToast('Failed to update title', 'warning');
    }
  }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    const lightbox = document.getElementById('lightbox');
    const shareModal = document.getElementById('shareModal');
    const titleForm = document.getElementById('titleEditForm');
    
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
    } else if (titleForm && titleForm.style.display === 'flex') {
      if (e.key === 'Escape') {
        Gallery.cancelEditTitle();
      }
    }
  });

  // Listen for HX-Trigger uploadComplete event
  document.body.addEventListener('uploadComplete', (e) => {
    Gallery.onUploadResult(e);
  });
});
