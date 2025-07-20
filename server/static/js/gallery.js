/**
 * Gallery with jQuery flexImages and Lightbox
 * Handles flexImages layout and lightbox functionality
 */
document.addEventListener('DOMContentLoaded', function() {
  // Initialize flexImages if jQuery is available
  if (typeof $ !== 'undefined') {
    initFlexImages();
  }
  
  // Initialize lightbox
  initLightbox();
  
  initUploadHandler();
  
  initCoverPhotoHandlers();
});

// Centralized gallery management
const GalleryManager = {
  config: {
    rowHeight: 200,
    maxRows: 0,
    truncate: 0,
    container: '.item',
    object: 'img'
  },
  
  // Initialize or re-initialize flexImages
  initFlexImages() {
    const gallery = $('#flexGallery');
    if (gallery.length && gallery.find('.item').length > 0) {
      gallery.flexImages(this.config);
    }
  },
  
  // Add new photo and refresh gallery
  addPhoto(photoHtml) {
    const gallery = document.getElementById('flexGallery');
    if (gallery) {
      gallery.insertAdjacentHTML('beforeend', photoHtml);
      
      // Hide empty state if it exists
      const emptyState = document.querySelector('.empty-state');
      if (emptyState) {
        emptyState.style.display = 'none';
      }
      
      // Re-initialize flexImages and lightbox
      setTimeout(() => {
        this.initFlexImages();
        if (window.LightboxManager) {
          window.LightboxManager.refreshListeners();
        }
      }, 100);
    }
  },
  
  // Handle window resize
  handleResize() {
    let resizeTimeout;
    return function() {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        GalleryManager.initFlexImages();
      }, 250);
    };
  }
};

// Make it globally available
window.GalleryManager = GalleryManager;

// Generic image polling utility
window.ImagePoller = {
  /**
   * Poll for image availability and show when ready
   * @param {HTMLImageElement} imgElement - The img element to test and show
   * @param {HTMLElement} loadingElement - The loading element to hide when ready
   * @param {number} maxAttempts - Maximum polling attempts (default: 30)
   * @param {number} startDelay - Initial delay before polling (default: 2000ms)
   */
  pollForImage(imgElement, loadingElement, maxAttempts = 30, startDelay = 2000) {
    if (!imgElement || !loadingElement) {
      console.warn('ImagePoller: Missing required img or loading element');
      return;
    }
    
    const baseUrl = imgElement.src.split('?')[0]; // Remove existing query params
    let attempts = 0;
    
    function checkImage() {
      attempts++;
      const testImg = new Image();
      
      testImg.onload = function() {
        // Image is ready - show it and hide spinner
        imgElement.src = `${baseUrl}?t=${Date.now()}`; // Cache-busting
        imgElement.style.display = 'block';
        loadingElement.style.display = 'none';
        
        // Refresh gallery layout
        setTimeout(() => {
          if (window.GalleryManager) {
            window.GalleryManager.initFlexImages();
          }
          if (window.LightboxManager) {
            window.LightboxManager.refreshListeners();
          }
        }, 100);
      };
      
      testImg.onerror = function() {
        if (attempts < maxAttempts) {
          setTimeout(checkImage, 1000);
        } else {
          loadingElement.innerHTML = '<div class="error-placeholder"><p>⚠️ Processing failed</p></div>';
        }
      };
      
      testImg.src = `${baseUrl}?t=${Date.now()}`;
    }
    
    setTimeout(checkImage, startDelay);
  }
};

// Function to extract image dimensions from file
function extractImageDimensions(file, callback) {
  const img = new Image();
  const url = URL.createObjectURL(file);
  
  img.onload = function() {
    callback(this.naturalWidth, this.naturalHeight);
    URL.revokeObjectURL(url); // Clean up
  };
  
  img.onerror = function() {
    console.warn('Could not read image dimensions, using defaults');
    callback(400, 300); // Fallback dimensions
    URL.revokeObjectURL(url);
  };
  
  img.src = url;
}

function initFlexImages() {
  GalleryManager.initFlexImages();
  
  // Setup resize handler
  if (typeof $ !== 'undefined') {
    $(window).off('resize.galleryManager').on('resize.galleryManager', GalleryManager.handleResize());
  }
}

function initLightbox() {
  // Create centralized lightbox manager
  window.LightboxManager = {
    lightbox: null,
    lightboxImg: null,
    currentIndex: 0,
    images: [],
    
    init() {
      if (this.lightbox) return; // Already initialized
      
      // Create lightbox HTML
      const lightboxHtml = `
        <div class="lightbox" id="lightbox">
          <span class="lightbox-close">&times;</span>
          <div class="lightbox-content">
            <img id="lightbox-img" src="" alt="">
          </div>
          <span class="lightbox-prev">&#10094;</span>
          <span class="lightbox-next">&#10095;</span>
        </div>
      `;
      
      document.body.insertAdjacentHTML('beforeend', lightboxHtml);
      
      this.lightbox = document.getElementById('lightbox');
      this.lightboxImg = document.getElementById('lightbox-img');
      
      this.setupEventListeners();
      this.refreshListeners();
    },
    
    setupEventListeners() {
      const closeBtn = document.querySelector('.lightbox-close');
      const prevBtn = document.querySelector('.lightbox-prev');
      const nextBtn = document.querySelector('.lightbox-next');
      
      // Close lightbox
      closeBtn.addEventListener('click', () => this.close());
      this.lightbox.addEventListener('click', (e) => {
        if (e.target === this.lightbox) this.close();
      });
      
      // Navigation
      prevBtn.addEventListener('click', () => this.prev());
      nextBtn.addEventListener('click', () => this.next());
      
      // Keyboard navigation
      document.addEventListener('keydown', (e) => {
        if (!this.lightbox.classList.contains('active')) return;
        
        switch(e.key) {
          case 'Escape': this.close(); break;
          case 'ArrowLeft': this.prev(); break;
          case 'ArrowRight': this.next(); break;
        }
      });
    },
    
    refreshListeners() {
      this.images = Array.from(document.querySelectorAll('.flex-images .item img'));
      
      this.images.forEach((img, index) => {
        // Remove existing listener to avoid duplicates
        img.removeEventListener('click', img._lightboxHandler);
        
        // Create new handler
        img._lightboxHandler = () => this.open(index);
        img.addEventListener('click', img._lightboxHandler);
      });
    },
    
    open(index) {
      this.currentIndex = index;
      const img = this.images[index];
      
      // Progressive loading: Start with current src (thumb), then display, then original
      const thumbUrl = img.src;
      const displayUrl = img.dataset.display || img.src;
      const originalUrl = img.dataset.original || displayUrl;
      
      // Show lightbox immediately with thumbnail for instant response
      this.lightboxImg.src = thumbUrl;
      this.lightbox.classList.add('active');
      
      // Progressively enhance to display quality
      if (displayUrl !== thumbUrl) {
        const displayImg = new Image();
        displayImg.onload = () => {
          this.lightboxImg.src = displayUrl;
          
          // Then load original for zooming/downloading
          if (originalUrl !== displayUrl) {
            const originalImg = new Image();
            originalImg.onload = () => {
              // Store original for right-click save/zoom
              this.lightboxImg.dataset.originalSrc = originalUrl;
            };
            originalImg.src = originalUrl;
          }
        };
        displayImg.src = displayUrl;
      } else if (originalUrl !== displayUrl) {
        // No display URL, load original directly
        const originalImg = new Image();
        originalImg.onload = () => {
          this.lightboxImg.src = originalUrl;
        };
        originalImg.src = originalUrl;
      }
    },
    
    close() {
      this.lightbox.classList.remove('active');
    },
    
    prev() {
      this.currentIndex = (this.currentIndex - 1 + this.images.length) % this.images.length;
      const originalUrl = this.images[this.currentIndex].dataset.original || this.images[this.currentIndex].src;
      this.lightboxImg.src = originalUrl;
    },
    
    next() {
      this.currentIndex = (this.currentIndex + 1) % this.images.length;
      const originalUrl = this.images[this.currentIndex].dataset.original || this.images[this.currentIndex].src;
      this.lightboxImg.src = originalUrl;
    }
  };
  
  window.LightboxManager.init();
}

function initUploadHandler() {
  const fileInput = document.getElementById('photo');
  const uploadForm = document.getElementById('uploadForm');
  const uploadLabel = document.getElementById('uploadLabel');
  const uploadStatus = document.getElementById('uploadStatus');

  // Only initialize if elements exist (gallery page)
  if (!fileInput || !uploadForm || !uploadLabel || !uploadStatus) {
    console.log('Upload handler: Missing elements', { fileInput: !!fileInput, uploadForm: !!uploadForm, uploadLabel: !!uploadLabel, uploadStatus: !!uploadStatus });
    return;
  }

  // Check if already initialized to prevent duplicate listeners
  if (fileInput._uploadListenerBound) {
    console.log('Upload handler already bound, skipping');
    return;
  }

  console.log('Upload handler initialized successfully');
  let isUploading = false; // Prevent multiple simultaneous uploads

  // Auto-upload when file is selected
  fileInput.addEventListener('change', function(e) {
    console.log('File input change event triggered', e.target.files.length);
    if (e.target.files.length > 0 && !isUploading) {
      const file = e.target.files[0];
      console.log('Starting upload for:', file.name);
      isUploading = true;
      
      // Show upload status
      uploadLabel.style.display = 'none';
      uploadStatus.style.display = 'block';
      
      // Extract image dimensions before upload
      extractImageDimensions(file, function(width, height) {
        // Add hidden inputs for dimensions
        const widthInput = document.createElement('input');
        widthInput.type = 'hidden';
        widthInput.name = 'width';
        widthInput.value = width;
        
        const heightInput = document.createElement('input');
        heightInput.type = 'hidden';
        heightInput.name = 'height';
        heightInput.value = height;
        
        // Remove any existing dimension inputs
        const existingInputs = uploadForm.querySelectorAll('input[name="width"], input[name="height"]');
        existingInputs.forEach(input => input.remove());
        
        // Add new dimension inputs
        uploadForm.appendChild(widthInput);
        uploadForm.appendChild(heightInput);
        
        // Auto-submit the form with dimensions
        uploadForm.dispatchEvent(new Event('submit'));
      });
    }
  });

  // Mark file input as having listener bound
  fileInput._uploadListenerBound = true;

  // Handle HTMX events for better UX
  uploadForm.addEventListener('htmx:afterRequest', function(e) {
    console.log('HTMX afterRequest event', { successful: e.detail.successful });
    isUploading = false; // Reset upload flag
    
    if (e.detail.successful) {
      console.log('Upload successful, resetting form');
      // Reset form and UI properly
      uploadForm.reset();
      
      // Check if file input still exists after reset
      const currentFileInput = document.getElementById('photo');
      console.log('File input after reset:', !!currentFileInput);
      
      // Remove any lingering dimension inputs (NOT the file input with name="photoFile")
      const existingInputs = uploadForm.querySelectorAll('input[name="width"], input[name="height"]');
      console.log('Removing dimension inputs:', existingInputs.length);
      existingInputs.forEach(input => input.remove());
      
      // Clear file input value explicitly
      fileInput.value = '';
      
      // Reset UI state - CRITICAL: Use textContent to avoid destroying the file input inside the label!
      uploadLabel.style.display = 'block';
      uploadStatus.style.display = 'none';
      uploadLabel.firstChild.textContent = '📷 Upload Photos';
      uploadLabel.style.background = '#007bff';
    } else {
      // Handle error - CRITICAL: Use textContent to avoid destroying the file input inside the label!
      uploadLabel.style.display = 'block';
      uploadStatus.style.display = 'none';
      uploadLabel.firstChild.textContent = '❌ Upload failed - Try again';
      uploadLabel.style.background = '#dc3545';
      
      // Clear file input on error too
      fileInput.value = '';
      
      // Remove any lingering dimension inputs (NOT the file input with name="photoFile")
      const existingInputs = uploadForm.querySelectorAll('input[name="width"], input[name="height"]');
      existingInputs.forEach(input => input.remove());
      
      setTimeout(() => {
        uploadLabel.firstChild.textContent = '📷 Upload Photos';
        uploadLabel.style.background = '#007bff';
      }, 3000);
    }
  });

  // Global event handlers for gallery updates
  document.addEventListener('htmx:afterSwap', function() {
    setTimeout(() => {
      if (window.LightboxManager) {
        window.LightboxManager.refreshListeners();
      }
      GalleryManager.initFlexImages();
      
      // Hide empty state if gallery now has photos
      const gallery = document.getElementById('flexGallery');
      const emptyState = document.querySelector('.empty-state');
      if (gallery && gallery.children.length > 0 && emptyState) {
        emptyState.style.display = 'none';
      }
    }, 100);
  });
}

function initCoverPhotoHandlers() {
  // Handle "Set as Cover" button clicks
  document.addEventListener('click', function(e) {
    if (e.target.classList.contains('set-cover-btn')) {
      e.preventDefault();
      e.stopPropagation();
      
      const button = e.target;
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
          // Show success feedback
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
          }, 2000);
          
          // Show success message
          showNotification('Cover photo updated successfully! 🎉', 'success');
        } else {
          throw new Error(data.error || 'Failed to set cover photo');
        }
      })
      .catch(error => {
        console.error('Error setting cover photo:', error);
        
        // Reset button
        button.textContent = originalText;
        button.disabled = false;
        
        // Show error message
        showNotification(error.message || 'Failed to set cover photo', 'error');
      });
    }
  });
}

function showNotification(message, type = 'info') {
  // Create notification element
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
  
  // Add to page
  document.body.appendChild(notification);
  
  // Animate in
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
  }, 3000);
}
