// Check Page Exists Middleware
// Auto-renders [pagename]-page.ejs for matching URLs

const fs = require('fs');
const path = require('path');

// SEO metadata for static pages
const pageMetadata = {
  'index-page': {
    title: 'EventGlimpse - Simple Photo Sharing for Events',
    description: 'Create event galleries and share photos effortlessly. No accounts needed for guests to upload. Perfect for weddings, parties, and family gatherings.',
    url: 'https://www.event-glimpse.com'
  },
  'about-page': {
    title: 'About EventGlimpse - Hassle-Free Event Photo Sharing',
    description: 'Learn how EventGlimpse makes event photo sharing simple. Create galleries, share QR codes, and collect memories without requiring guest accounts.',
    url: 'https://www.event-glimpse.com/about'
  },
  'dashboard-page': {
    title: 'My Galleries - EventGlimpse',
    description: 'Manage your event photo galleries on EventGlimpse.',
    url: 'https://www.event-glimpse.com/dashboard'
  }
};

module.exports = (req, res, next) => {
  const pageName = req.path === '/' ? 'index-page' : req.path.substring(1) + '-page';
  const filePath = path.join(__dirname, '..', 'views', `${pageName}.ejs`);
  
  fs.access(filePath, fs.constants.F_OK, (err) => {
    if (err) {
      return next();
    }
    
    const metadata = pageMetadata[pageName] || {};
    const baseUrl = process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
    
    res.render('layout-main', { 
      template: pageName,
      pageData: {},
      pageTitle: metadata.title,
      pageDescription: metadata.description,
      pageUrl: metadata.url || `${baseUrl}${req.path}`
    });  
  });
};
