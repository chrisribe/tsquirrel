/**
 * Main JS - Site-wide functionality
 */
document.addEventListener('DOMContentLoaded', () => {
  
  // Close hamburger menu when clicking outside
  document.addEventListener('click', (e) => {
    const menu = document.querySelector('.hamburger-menu');
    if (menu && !menu.contains(e.target)) {
      menu.classList.remove('open');
    }
  });
  
});
