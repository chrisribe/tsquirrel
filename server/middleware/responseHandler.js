// Response Handler Middleware

// Adds a new responseHandler method to response objects.
// Allows the response to render JSON or a htmx template based on the request headers.

const allowedViewTemplates = require('../configs/viewTemplates');

function responseHandler() {
  return (req, res, next) => {
    const queryTemplate = req.query.tmpl;
    const dataKey = allowedViewTemplates[queryTemplate];

    if (req.headers['hx-request'] && !dataKey) {
      return res.status(400).json({ error: 'Invalid template specified' });
    }

    res.respondWithTemplateOrJson = (data, defaultTemplate) => {
      const template = queryTemplate || defaultTemplate;

      if (req.headers['hx-request'] && dataKey) {
        res.render(template, { [dataKey]: data, 'statusCode': res.statusCode });
      } 
      else if (req.accepts('html')) {
        res.render('layout-main', { pageName: defaultTemplate, pageData: data });
      } else {
        res.json(data);
      }
    };
    next();
  };
}

module.exports = responseHandler;
