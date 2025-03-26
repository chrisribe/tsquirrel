// Response Handler Middleware

// Adds a new responseHandler method to response objects.
// Allows the response to render JSON or a htmx template based on the request headers.

module.exports = (req, res, next) => {
  res.respondWithTemplateOrJson = (data, templatePath) => {
    // Handle redirects first
    if (data.redirect) {
      if (req.headers['hx-request']) {
        res.header('HX-Redirect', data.redirect);
        return res.send('');
      }
      return res.redirect(data.redirect);
    }
    
    // HTMX request - return partial HTML
    if (req.headers['hx-request']) {
      return res.render(templatePath, data);
    }
    
    // API request - return JSON
    if (req.xhr || req.headers['accept'] === 'application/json') {
      return res.json(data);
    }
    
    // For regular browser requests
    return res.render('layout-main', { 
      template: templatePath,
      data
    });
  };
  
  next();
};