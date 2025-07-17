(function() {
  document.addEventListener('DOMContentLoaded', function() {

    initializeModals();

  });

  function initializeModals() {
    // Handle modal open buttons
    document.querySelectorAll('[data-open-modal]').forEach(function(button) {
      button.addEventListener('click', function() {
        const modalId = button.getAttribute('data-open-modal');
        const modal = document.getElementById(modalId);
        
        if (modal) {
          // Show the modal
          modal.showModal();
          
          // Set up close handlers when modal is shown
          setupModalCloseHandlers(modal);
        }
      });
    });

  }

  function setupModalCloseHandlers(modal) {
    // Close button handler
    const closeButtons = modal.querySelectorAll('.close');
    closeButtons.forEach(btn => {
      // Remove existing listeners to prevent duplicates
      btn.replaceWith(btn.cloneNode(true));
      
      // Add fresh event listener
      modal.querySelector('.close').addEventListener('click', function(e) {
        e.preventDefault();
        modal.close();
      });
    });
    
    // Optional: Close on click outside
    modal.addEventListener('click', function(e) {
      if (e.target === modal) modal.close();
    }, { once: true });

    // Close on form submission
    const forms = modal.querySelectorAll('form:not([hx-post]):not([hx-get])');
    forms.forEach(form => {
      form.addEventListener('submit', function() {
        form.reset();
        setTimeout(() => modal.close(), 300);
      });
    });
    
    // For HTMX forms, only close on successful responses
    const htmxForms = modal.querySelectorAll('form[hx-post], form[hx-get]');
    htmxForms.forEach(form => {
      form.addEventListener('htmx:afterOnLoad', function(event) {
        // Check if response contains error indicators
        const responseText = event.detail.xhr.responseText;
        const hasError = responseText.includes('error') || 
                        event.detail.xhr.status >= 400;
                        
        if (!hasError) {
          form.reset();
          modal.close();
        }
      });
    });  
  }  

})();