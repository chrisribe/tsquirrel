// Response Handler Middleware

// Adds a new responseHandler method to response objects.
// Allows the response to render JSON or a htmx template based on the request headers.

module.exports = (req, res, next) => {
  res.respondWithTemplateOrJson = (pageData, templatePath) => {
    // Default to JSON when no template is provided
    if (!templatePath) {
      return res.json(pageData);
    }
        
    // Handle redirects first
    if (pageData.redirect) {
      if (req.headers['hx-request']) {
        res.header('HX-Redirect', pageData.redirect);
        return res.send('');
      }
      return res.redirect(pageData.redirect);
    }
    
    // HTMX request - return partial HTML
    if (req.headers['hx-request']) {
      return res.render(templatePath, { pageData: pageData });
    }
    
    // API request - return JSON
    if (req.xhr || req.headers['accept'] === 'application/json') {
      return res.json(pageData);
    }
    
    // For regular browser requests
    return res.render('layout-main', { 
      template: templatePath,
      pageData: pageData
    });
  };
  
  next();
};