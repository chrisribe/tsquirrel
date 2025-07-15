/**
 * Gallery Upload Handler
 * Handles auto-upload functionality for photo galleries
 */
document.addEventListener('DOMContentLoaded', function() {
  const fileInput = document.getElementById('photo');
  const uploadForm = document.getElementById('uploadForm');
  const uploadLabel = document.getElementById('uploadLabel');
  const uploadStatus = document.getElementById('uploadStatus');

  // Only initialize if elements exist (gallery page)
  if (!fileInput || !uploadForm || !uploadLabel || !uploadStatus) {
    return;
  }

  // Auto-upload when file is selected
  fileInput.addEventListener('change', function(e) {
    if (e.target.files.length > 0) {
      // Show upload status
      uploadLabel.style.display = 'none';
      uploadStatus.style.display = 'block';
      
      // Auto-submit the form
      uploadForm.dispatchEvent(new Event('submit'));
    }
  });

  // Handle HTMX events for better UX
  uploadForm.addEventListener('htmx:afterRequest', function(e) {
    if (e.detail.successful) {
      // Reset form and UI
      uploadForm.reset();
      uploadLabel.style.display = 'block';
      uploadStatus.style.display = 'none';
      uploadLabel.innerHTML = '📷 Choose & Upload Photo';
    } else {
      // Handle error
      uploadLabel.style.display = 'block';
      uploadStatus.style.display = 'none';
      uploadLabel.innerHTML = '❌ Upload failed - Try again';
      uploadLabel.style.background = '#dc3545';
      
      setTimeout(() => {
        uploadLabel.innerHTML = '📷 Choose & Upload Photo';
        uploadLabel.style.background = '#007bff';
      }, 3000);
    }
  });
});
