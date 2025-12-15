// Response Handler Middleware
// Allows responses to render JSON or EJS templates based on request type

module.exports = (req, res, next) => {
  res.respondWithTemplateOrJson = (pageData, templatePath) => {
    // Default to JSON when no template provided
    if (!templatePath) {
      return res.json(pageData);
    }
        
    // Handle redirects
    if (pageData.redirect) {
      if (req.headers['hx-request']) {
        res.header('HX-Redirect', pageData.redirect);
        return res.send('');
      }
      return res.redirect(pageData.redirect);
    }
    
    // HTMX request - return partial HTML
    if (req.headers['hx-request']) {
      return res.render(templatePath, { pageData });
    }
    
    // API request - return JSON
    if (req.xhr || req.headers['accept'] === 'application/json') {
      return res.json(pageData);
    }
    
    // Browser request - render full page with layout
    return res.render('layout-main', { 
      template: templatePath,
      pageData,
      pageAssets: pageData.pageAssets || {}  // Make pageAssets available at layout level
    });
  };
  
  next();
};
