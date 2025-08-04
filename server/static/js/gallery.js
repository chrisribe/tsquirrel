/**
 * Gallery Module - Centralized gallery functionality
 * Handles flexImages layout, lightbox, uploads, and image polling
 */
const Gallery = (function() {
  'use strict';
  
  // ========================================================================
  // Configuration & State
  // ========================================================================
  
  const config = {
    flexImages: {
      rowHeight: 200,
      maxRows: 0,
      truncate: 0,
      container: '.item',
      object: 'img'
    },
    polling: {
      maxAttempts: 30,
      startDelay: 2000,
      retryInterval: 1000
    },
    ui: {
      resizeDebounce: 250,
      notificationDuration: 3000,
      successFeedbackDuration: 2000
    }
  };
  
  let state = {
    isInitialized: false,
    isUploading: false,
    lightbox: {
      element: null,
      img: null,
      currentIndex: 0,
      images: []
    }
  };
  
  // ========================================================================
  // Layout Management
  // ========================================================================
  
  const Layout = {
    init() {
      if (typeof $ !== 'undefined') {
        this.initFlexImages();
        this.setupResizeHandler();
      }
    },
    
    initFlexImages() {
      const gallery = $('#flexGallery');
      if (gallery.length && gallery.find('.item').length > 0) {
        gallery.flexImages(config.flexImages);
      }
    },
    
    addPhoto(photoHtml) {
      const gallery = document.getElementById('flexGallery');
      if (!gallery) return;
      
      gallery.insertAdjacentHTML('beforeend', photoHtml);
      this.hideEmptyState();
      
      // Re-initialize layout and components after DOM update
      setTimeout(() => {
        this.initFlexImages();
        Lightbox.refreshListeners();
      }, 100);
    },
    
    hideEmptyState() {
      const emptyState = document.querySelector('.empty-state');
      if (emptyState) {
        emptyState.style.display = 'none';
      }
    },
    
    setupResizeHandler() {
      if (typeof $ === 'undefined') return;
      
      let resizeTimeout;
      const debouncedResize = () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
          this.initFlexImages();
        }, config.ui.resizeDebounce);
      };
      
      $(window).off('resize.gallery').on('resize.gallery', debouncedResize);
    }
  };

  
  // ========================================================================
  // Image Polling Management
  // ========================================================================
  
  const ImagePoller = {
    pollForImage(imgElement, loadingElement, maxAttempts = config.polling.maxAttempts, startDelay = config.polling.startDelay) {
      if (!imgElement || !loadingElement) {
        console.warn('ImagePoller: Missing required img or loading element');
        return;
      }
      
      const baseUrl = imgElement.src.split('?')[0];
      let attempts = 0;
      
      const checkImage = () => {
        attempts++;
        const testImg = new Image();
        
        testImg.onload = () => {
          imgElement.src = `${baseUrl}?t=${Date.now()}`;
          imgElement.style.display = 'block';
          loadingElement.style.display = 'none';
          
          setTimeout(() => {
            Layout.initFlexImages();
            Lightbox.refreshListeners();
          }, 100);
        };
        
        testImg.onerror = () => {
          if (attempts < maxAttempts) {
            setTimeout(checkImage, config.polling.retryInterval);
          } else {
            loadingElement.innerHTML = '<div class="error-placeholder"><p>⚠️ Processing failed</p></div>';
          }
        };
        
        testImg.src = `${baseUrl}?t=${Date.now()}`;
      };
      
      setTimeout(checkImage, startDelay);
    },
    
    initNewPhotos() {
      const newItems = document.querySelectorAll('.item .photo-loading');
      console.log(`ImagePoller: Initializing polling for ${newItems.length} new photos`);
      
      newItems.forEach(loadingDiv => {
        const itemDiv = loadingDiv.closest('.item');
        if (itemDiv) {
          const img = itemDiv.querySelector('img');
          if (img && loadingDiv) {
            this.pollForImage(img, loadingDiv);
          }
        }
      });
    }
  };

  
  // ========================================================================
  // Lightbox Management
  // ========================================================================
  
  const Lightbox = {
    init() {
      if (state.lightbox.element) return; // Already initialized
      
      this.createLightboxHTML();
      this.setupEventListeners();
      this.refreshListeners();
    },
    
    createLightboxHTML() {
      const lightboxHtml = `
        <div class="lightbox" id="lightbox">
          <span class="lightbox-close">&times;</span>
          <div class="lightbox-content">
            <img id="lightbox-img" src="" alt="">
            <div class="lightbox-controls">
              <button class="lightbox-download" title="Download Original">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7,10 12,15 17,10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                Download
              </button>
              <button class="lightbox-zoom" title="View Original Size">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="11" cy="11" r="8"/>
                  <path d="m21 21-4.35-4.35"/>
                  <line x1="15" y1="9" x2="9" y2="15"/>
                  <line x1="9" y1="9" x2="15" y2="15"/>
                </svg>
                Original
              </button>
            </div>
          </div>
          <span class="lightbox-prev">&#10094;</span>
          <span class="lightbox-next">&#10095;</span>
        </div>
      `;
      
      document.body.insertAdjacentHTML('beforeend', lightboxHtml);
      
      state.lightbox.element = document.getElementById('lightbox');
      state.lightbox.img = document.getElementById('lightbox-img');
    },
    
    setupEventListeners() {
      const closeBtn = document.querySelector('.lightbox-close');
      const prevBtn = document.querySelector('.lightbox-prev');
      const nextBtn = document.querySelector('.lightbox-next');
      const downloadBtn = document.querySelector('.lightbox-download');
      const zoomBtn = document.querySelector('.lightbox-zoom');
      
      // Close lightbox
      closeBtn.addEventListener('click', () => this.close());
      state.lightbox.element.addEventListener('click', (e) => {
        if (e.target === state.lightbox.element) this.close();
      });
      
      // Navigation
      prevBtn.addEventListener('click', () => this.prev());
      nextBtn.addEventListener('click', () => this.next());
      
      // Controls
      downloadBtn.addEventListener('click', () => this.downloadOriginal());
      zoomBtn.addEventListener('click', () => this.toggleOriginal());
      
      // Keyboard navigation
      document.addEventListener('keydown', (e) => {
        if (!state.lightbox.element.classList.contains('active')) return;
        
        switch(e.key) {
          case 'Escape': this.close(); break;
          case 'ArrowLeft': this.prev(); break;
          case 'ArrowRight': this.next(); break;
          case 'd': case 'D': this.downloadOriginal(); break;
          case 'o': case 'O': this.toggleOriginal(); break;
        }
      });
    },
    
    refreshListeners() {
      state.lightbox.images = Array.from(document.querySelectorAll('.flex-images .item img'));
      
      state.lightbox.images.forEach((img, index) => {
        // Remove existing listener to avoid duplicates
        img.removeEventListener('click', img._lightboxHandler);
        
        // Create new handler
        img._lightboxHandler = () => this.open(index);
        img.addEventListener('click', img._lightboxHandler);
      });
    },
    
    open(index) {
      state.lightbox.currentIndex = index;
      const img = state.lightbox.images[index];
      
      // Progressive loading: Start with current src, then display, then original
      const thumbUrl = img.src;
      const displayUrl = img.dataset.display || img.src;
      const originalUrl = img.dataset.original || displayUrl;
      
      // Show lightbox immediately with thumbnail
      state.lightbox.img.src = thumbUrl;
      state.lightbox.element.classList.add('active');
      
      // Progressively enhance to display quality
      if (displayUrl !== thumbUrl) {
        const displayImg = new Image();
        displayImg.onload = () => {
          state.lightbox.img.src = displayUrl;
          
          // Then load original for zooming/downloading
          if (originalUrl !== displayUrl) {
            const originalImg = new Image();
            originalImg.onload = () => {
              state.lightbox.img.dataset.originalSrc = originalUrl;
            };
            originalImg.src = originalUrl;
          }
        };
        displayImg.src = displayUrl;
      } else if (originalUrl !== displayUrl) {
        const originalImg = new Image();
        originalImg.onload = () => {
          state.lightbox.img.src = originalUrl;
        };
        originalImg.src = originalUrl;
      }
    },
    
    close() {
      state.lightbox.element.classList.remove('active');
    },
    
    prev() {
      state.lightbox.currentIndex = (state.lightbox.currentIndex - 1 + state.lightbox.images.length) % state.lightbox.images.length;
      const originalUrl = state.lightbox.images[state.lightbox.currentIndex].dataset.original || state.lightbox.images[state.lightbox.currentIndex].src;
      state.lightbox.img.src = originalUrl;
    },
    
    next() {
      state.lightbox.currentIndex = (state.lightbox.currentIndex + 1) % state.lightbox.images.length;
      const originalUrl = state.lightbox.images[state.lightbox.currentIndex].dataset.original || state.lightbox.images[state.lightbox.currentIndex].src;
      state.lightbox.img.src = originalUrl;
    },
    
    downloadOriginal() {
      const img = state.lightbox.images[state.lightbox.currentIndex];
      const originalUrl = img.dataset.original || img.dataset.display || img.src;
      const originalName = img.alt || `photo-${state.lightbox.currentIndex + 1}`;
      
      // Create download link
      const link = document.createElement('a');
      link.href = originalUrl;
      link.download = originalName;
      link.target = '_blank';
      
      // Trigger download
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Show feedback
      const downloadBtn = document.querySelector('.lightbox-download');
      const originalText = downloadBtn.innerHTML;
      downloadBtn.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="20,6 9,17 4,12"/>
        </svg>
        Downloaded!
      `;
      
      setTimeout(() => {
        downloadBtn.innerHTML = originalText;
      }, config.ui.successFeedbackDuration);
    },
    
    toggleOriginal() {
      const img = state.lightbox.images[state.lightbox.currentIndex];
      const displayUrl = img.dataset.display || img.src;
      const originalUrl = img.dataset.original || displayUrl;
      const zoomBtn = document.querySelector('.lightbox-zoom');
      
      // Toggle between display and original
      if (state.lightbox.img.src === originalUrl) {
        // Currently showing original, switch to display
        state.lightbox.img.src = displayUrl;
        zoomBtn.innerHTML = `
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"/>
            <path d="m21 21-4.35-4.35"/>
            <line x1="15" y1="9" x2="9" y2="15"/>
            <line x1="9" y1="9" x2="15" y2="15"/>
          </svg>
          Original
        `;
        zoomBtn.title = "View Original Size";
      } else {
        // Currently showing display, switch to original
        state.lightbox.img.src = originalUrl;
        zoomBtn.innerHTML = `
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"/>
            <path d="m21 21-4.35-4.35"/>
            <line x1="11" y1="11" x2="11" y2="11"/>
          </svg>
          Display
        `;
        zoomBtn.title = "View Display Size";
      }
    }
  };

  
  // ========================================================================
  // Upload Management
  // ========================================================================
  
  const Upload = {
    init() {
      const fileInput = document.getElementById('photo');
      const uploadForm = document.getElementById('uploadForm');
      const uploadLabel = document.getElementById('uploadLabel');
      const uploadStatus = document.getElementById('uploadStatus');

      // Only initialize if elements exist (gallery page)
      if (!fileInput || !uploadForm || !uploadLabel || !uploadStatus) {
        console.log('Upload handler: Missing elements');
        return;
      }

      // Check if already initialized to prevent duplicate listeners
      if (fileInput._uploadListenerBound) {
        console.log('Upload handler already bound, skipping');
        return;
      }

      console.log('Upload handler initialized successfully');
      
      this.setupFileInputHandler(fileInput, uploadForm, uploadLabel, uploadStatus);
      this.setupHTMXHandlers(uploadForm, fileInput, uploadLabel, uploadStatus);
      this.setupGlobalEventHandlers();
      
      fileInput._uploadListenerBound = true;
    },
    
    setupFileInputHandler(fileInput, uploadForm, uploadLabel, uploadStatus) {
      fileInput.addEventListener('change', (e) => {
        console.log('File input change event triggered', e.target.files.length);
        if (e.target.files.length > 0 && !state.isUploading) {
          const files = Array.from(e.target.files);
          console.log('Starting upload for:', files.map(f => f.name).join(', '));
          state.isUploading = true;
          
          // Show upload status with file count
          uploadLabel.style.display = 'none';
          uploadStatus.style.display = 'block';
          uploadStatus.innerHTML = `<div class="uploading">📤 Uploading ${files.length} photo${files.length > 1 ? 's' : ''}...</div>`;
          
          uploadForm.dispatchEvent(new Event('submit'));
        }
      });
    },
    
    setupHTMXHandlers(uploadForm, fileInput, uploadLabel, uploadStatus) {
      uploadForm.addEventListener('htmx:afterRequest', (e) => {
        console.log('HTMX afterRequest event', { successful: e.detail.successful });
        state.isUploading = false;
        
        if (e.detail.successful) {
          this.handleUploadSuccess(uploadForm, fileInput, uploadLabel, uploadStatus, e);
        } else {
          this.handleUploadError(fileInput, uploadLabel, uploadStatus);
        }
      });
    },
    
    handleUploadSuccess(uploadForm, fileInput, uploadLabel, uploadStatus, event) {
      console.log('Upload successful, resetting form');
      uploadForm.reset();
      
      // Remove any lingering dimension inputs
      const existingInputs = uploadForm.querySelectorAll('input[name="width"], input[name="height"]');
      console.log('Removing dimension inputs:', existingInputs.length);
      existingInputs.forEach(input => input.remove());
      
      fileInput.value = '';
      
      // Reset UI state
      uploadLabel.style.display = 'block';
      uploadStatus.style.display = 'none';
      uploadLabel.firstChild.textContent = '📷 Upload Photos';
      uploadLabel.style.background = '#007bff';
      
      // Show success notification
      const fileCount = event.detail.xhr.responseText ? (event.detail.xhr.responseText.match(/class="item"/g) || []).length : 1;
      UI.showNotification(`${fileCount} photo${fileCount > 1 ? 's' : ''} uploaded successfully! 🎉`, 'success');
    },
    
    handleUploadError(fileInput, uploadLabel, uploadStatus) {
      uploadLabel.style.display = 'block';
      uploadStatus.style.display = 'none';
      uploadLabel.firstChild.textContent = '❌ Upload failed - Try again';
      uploadLabel.style.background = '#dc3545';
      
      fileInput.value = '';
      
      // Remove any lingering dimension inputs
      const existingInputs = document.querySelectorAll('input[name="width"], input[name="height"]');
      existingInputs.forEach(input => input.remove());
      
      setTimeout(() => {
        uploadLabel.firstChild.textContent = '📷 Upload Photos';
        uploadLabel.style.background = '#007bff';
      }, config.ui.notificationDuration);
    },
    
    setupGlobalEventHandlers() {
      document.addEventListener('htmx:afterSwap', () => {
        setTimeout(() => {
          Lightbox.refreshListeners();
          Layout.initFlexImages();
          Layout.hideEmptyState();
          ImagePoller.initNewPhotos();
        }, 100);
      });
    }
  };
  
  // ========================================================================
  // Cover Photo Management
  // ========================================================================
  
  const CoverPhoto = {
    init() {
      // Scope the listener to the gallery container instead of entire document
      const galleryContainer = document.getElementById('flexGallery');
      if (!galleryContainer) {
        console.log('CoverPhoto: Gallery container not found, skipping initialization');
        return;
      }
      
      galleryContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('set-cover-btn')) {
          e.preventDefault();
          e.stopPropagation();
          
          this.handleSetCover(e.target);
        }
      });
    },
    
    handleSetCover(button) {
      const photoId = button.dataset.photoId;
      const eventUuid = button.dataset.eventUuid;
      
      if (!photoId || !eventUuid) {
        console.error('Missing photo ID or event UUID');
        return;
      }
      
      // Show loading state
      const originalText = button.textContent;
      button.textContent = '⏳ Setting...';
      button.disabled = true;
      
      // Make PATCH request to set cover photo
      fetch(`/events/${eventUuid}/photos/${photoId}/cover`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        }
      })
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          this.handleSetCoverSuccess(button, originalText);
        } else {
          throw new Error(data.error || 'Failed to set cover photo');
        }
      })
      .catch(error => {
        this.handleSetCoverError(button, originalText, error);
      });
    },
    
    handleSetCoverSuccess(button, originalText) {
      button.textContent = '✅ Cover Set!';
      button.style.background = '#28a745';
      
      // Reset all other buttons
      document.querySelectorAll('.set-cover-btn').forEach(btn => {
        if (btn !== button) {
          btn.textContent = '🖼️ Set as Cover';
          btn.style.background = '';
          btn.disabled = false;
        }
      });
      
      // Reset this button after a delay
      setTimeout(() => {
        button.textContent = originalText;
        button.disabled = false;
      }, config.ui.successFeedbackDuration);
      
      UI.showNotification('Cover photo updated successfully! 🎉', 'success');
    },
    
    handleSetCoverError(button, originalText, error) {
      console.error('Error setting cover photo:', error);
      
      button.textContent = originalText;
      button.disabled = false;
      
      UI.showNotification(error.message || 'Failed to set cover photo', 'error');
    }
  };
  
  // ========================================================================
  // UI Utilities
  // ========================================================================
  
  const UI = {
    showNotification(message, type = 'info') {
      const notification = document.createElement('div');
      notification.className = `notification notification-${type}`;
      notification.textContent = message;
      
      // Style the notification
      Object.assign(notification.style, {
        position: 'fixed',
        top: '20px',
        right: '20px',
        padding: '12px 20px',
        borderRadius: '4px',
        color: 'white',
        fontWeight: 'bold',
        zIndex: '10000',
        transform: 'translateX(100%)',
        transition: 'transform 0.3s ease'
      });
      
      // Set background color based on type
      switch(type) {
        case 'success':
          notification.style.background = '#28a745';
          break;
        case 'error':
          notification.style.background = '#dc3545';
          break;
        default:
          notification.style.background = '#007bff';
      }
      
      // Add to page and animate
      document.body.appendChild(notification);
      
      setTimeout(() => {
        notification.style.transform = 'translateX(0)';
      }, 10);
      
      // Remove after delay
      setTimeout(() => {
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => {
          if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
          }
        }, 300);
      }, config.ui.notificationDuration);
    }
  };
  
  // ========================================================================
  // Public API
  // ========================================================================
  
  return {
    // Initialization
    init() {
      if (state.isInitialized) {
        console.log('Gallery already initialized');
        return;
      }
      
      Layout.init();
      Lightbox.init();
      Upload.init();
      CoverPhoto.init();
      
      state.isInitialized = true;
      console.log('Gallery module initialized');
    },
    
    // Public methods for external use
    addPhoto: (photoHtml) => Layout.addPhoto(photoHtml),
    refreshLayout: () => Layout.initFlexImages(),
    refreshLightbox: () => Lightbox.refreshListeners(),
    initNewPhotos: () => ImagePoller.initNewPhotos(),
    showNotification: (message, type) => UI.showNotification(message, type)
  };
  
})();

// ========================================================================
// Auto-initialization
// ========================================================================

document.addEventListener('DOMContentLoaded', function() {
  Gallery.init();
});

// Make Gallery available globally
window.Gallery = Gallery;
