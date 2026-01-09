/**
 * Flex Images - Lightweight masonry-like grid for natural aspect ratios
 * Vanilla JS version (no jQuery dependency)
 * Based on flex-images concept
 */
(function() {
  'use strict';

  window.FlexImages = function(container, options) {
    if (typeof container === 'string') {
      container = document.querySelector(container);
    }
    
    if (!container) return;

    const defaults = {
      rowHeight: 280,
      maxRows: 0,
      truncate: false,
      selector: '.item'
    };

    const settings = Object.assign({}, defaults, options);
    
    function layout() {
      const items = Array.from(container.querySelectorAll(settings.selector));
      if (!items.length) return;

      const containerWidth = container.clientWidth;
      const margin = 3; // Match CSS margin
      
      let row = [];
      let rowWidth = 0;

      // Reset all items first
      items.forEach(item => {
        item.style.width = '';
        item.style.height = '';
      });

      items.forEach((item, index) => {
        // Get dimensions from data attributes
        const w = parseInt(item.dataset.w) || 300;
        const h = parseInt(item.dataset.h) || 200;
        
        // Calculate width at target row height
        const ratio = w / h;
        const targetWidth = Math.round(settings.rowHeight * ratio);
        
        row.push({ el: item, width: targetWidth, ratio: ratio });
        rowWidth += targetWidth + (margin * 2);

        const isLastItem = index === items.length - 1;
        
        // Check if row is full or last item
        if (rowWidth >= containerWidth || isLastItem) {
          // Calculate the row height that makes items fit
          const totalMargins = row.length * margin * 2;
          const availableWidth = containerWidth - totalMargins;
          const totalRatio = row.reduce((sum, item) => sum + item.ratio, 0);
          
          // For last incomplete row, don't stretch - use target height
          let rowHeight;
          if (isLastItem && rowWidth < containerWidth * 0.85) {
            rowHeight = settings.rowHeight;
          } else {
            rowHeight = Math.floor(availableWidth / totalRatio);
          }
          
          // Apply dimensions to each item in the row
          row.forEach(item => {
            const finalWidth = Math.floor(rowHeight * item.ratio);
            item.el.style.width = finalWidth + 'px';
            item.el.style.height = rowHeight + 'px';
          });

          // Reset for next row
          row = [];
          rowWidth = 0;
        }
      });
    }

    // Initial layout after images might have loaded
    layout();
    
    // Re-layout after a short delay for any late-loading content
    setTimeout(layout, 100);

    // Debounced resize handler
    let resizeTimer;
    const handleResize = function() {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(layout, 100);
    };
    
    window.addEventListener('resize', handleResize);

    // Return public API
    return {
      layout: layout,
      destroy: function() {
        window.removeEventListener('resize', handleResize);
      }
    };
  };

})();
