(function() {
  document.addEventListener('DOMContentLoaded', function() {

    initializeModals();
    initializeTabs();
    
    // Listen for HTMX content loads to reinitialize tabs
    document.addEventListener('htmx:afterSwap', function(event) {
      // Check if the swapped content is in a modal or is modal content
      const modal = event.target.closest('dialog') || 
                   (event.target.classList && event.target.classList.contains('modal-content') ? 
                    event.target.closest('dialog') : null);
      
      if (modal) {
        console.log('HTMX content loaded in modal, initializing tabs...'); // Debug log
        // Small delay to ensure DOM is ready
        setTimeout(() => initializeTabsInModal(modal), 50);
      }
    });
    
    // Also listen specifically for editEventModal content loads
    document.addEventListener('htmx:afterSwap', function(event) {
      if (event.target && event.target.matches('#editEventModal .modal-content')) {
        const modal = document.getElementById('editEventModal');
        console.log('Edit modal content loaded specifically'); // Debug log
        setTimeout(() => initializeTabsInModal(modal), 100);
      }
    });

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
          
          // Initialize tabs within the modal (may not have content yet)
          setTimeout(() => initializeTabsInModal(modal), 100);
        }
      });
    });

  }

  function initializeTabs() {
    // Initialize tabs for any existing modals
    document.querySelectorAll('dialog').forEach(modal => {
      initializeTabsInModal(modal);
    });
  }

  function initializeTabsInModal(modal) {
    const tabButtons = modal.querySelectorAll('.tab-btn');
    const tabContents = modal.querySelectorAll('.tab-content');
    
    if (tabButtons.length === 0) return;
    
    // Remove existing event listeners by cloning buttons
    tabButtons.forEach((btn, index) => {
      const newBtn = btn.cloneNode(true);
      btn.parentNode.replaceChild(newBtn, btn);
    });
    
    // Get the fresh button references
    const freshTabButtons = modal.querySelectorAll('.tab-btn');
    
    freshTabButtons.forEach(btn => {
      btn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        
        const targetTab = btn.getAttribute('data-tab');
        console.log('Tab clicked:', targetTab); // Debug log
        
        // Remove active class from all buttons and contents
        freshTabButtons.forEach(b => b.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));
        
        // Add active class to clicked button
        btn.classList.add('active');
        
        // Show corresponding content
        const targetContent = modal.querySelector(`#tab-${targetTab}`);
        if (targetContent) {
          targetContent.classList.add('active');
          console.log('Tab content shown:', targetTab); // Debug log
        } else {
          console.log('Tab content not found:', `#tab-${targetTab}`); // Debug log
        }
      });
    });
    
    console.log('Tabs initialized:', freshTabButtons.length); // Debug log
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