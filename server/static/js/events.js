(function() {
  document.addEventListener('DOMContentLoaded', function() {
    initializeEventFormHandlers();
  });

  function initializeEventFormHandlers() {
    const addEventForm = document.getElementById('addEventForm');
    if (!addEventForm) return;

    // Add debugging for form submission
    addEventForm.addEventListener('htmx:beforeRequest', function(evt) {
      console.log('HTMX request starting:', evt.detail);
    });
    
    addEventForm.addEventListener('htmx:afterRequest', function(evt) {
      console.log('HTMX request completed:', evt.detail);
      console.log('Response status:', evt.detail.xhr.status);
      console.log('Response headers:', evt.detail.xhr.getAllResponseHeaders());
    });
    
    // Handle network/connection errors
    addEventForm.addEventListener('htmx:error', function(evt) {
      console.log('HTMX error details:', evt.detail);
      
      let errorMessage = 'Network error. Please try again.';
      
      // Check different possible error structures
      if (evt.detail.xhr && evt.detail.xhr.responseText) {
        // If we get a login page back, user is not authenticated
        if (evt.detail.xhr.responseText.includes('login') || evt.detail.xhr.responseText.includes('Sign In')) {
          errorMessage = 'Your session has expired. Please refresh the page and log in again.';
        }
        addEventForm.innerHTML = `<div class="error">${errorMessage}</div>`;
      } else if (evt.detail.errorInfo && evt.detail.errorInfo.xhr && evt.detail.errorInfo.xhr.responseText) {
        addEventForm.innerHTML = evt.detail.errorInfo.xhr.responseText;
      } else {
        addEventForm.innerHTML = `<div class="error">${errorMessage}</div>`;
      }
    });
    
    // Handle server response errors (4xx, 5xx status codes)
    addEventForm.addEventListener('htmx:responseError', function(evt) {
      console.log('HTMX response error:', evt.detail);
      
      // Check if we got redirected to login (status 200 but login content)
      if (evt.detail.xhr.status === 200 && evt.detail.xhr.responseText.includes('login')) {
        addEventForm.innerHTML = '<div class="error">Your session has expired. Please refresh the page and log in again.</div>';
      } else if (evt.detail.xhr && evt.detail.xhr.responseText) {
        addEventForm.innerHTML = evt.detail.xhr.responseText;
      } else {
        addEventForm.innerHTML = '<div class="error">Server error. Please try again.</div>';
      }
    });
  }

})();
