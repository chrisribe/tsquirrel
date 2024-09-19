// Response Handler Middleware

// Adds a new responseHandler method to response objects.
// Allows the response to render JSON or a htmx template based on the request headers.

const allowedViewTemplates = require('../configs/viewTemplates');

function responseHandler() {
  return (req, res, next) => {
    const template = req.query.tmpl;
    const dataKey = allowedViewTemplates[template];

    if (req.headers['hx-request'] && !dataKey) {
      return res.status(400).json({ error: 'Invalid template specified' });
    }

    res.respondWithTemplateOrJson = (data) => {
      if (req.headers['hx-request'] && dataKey) {
        res.render(template, { [dataKey]: data, 'statusCode': res.statusCode });
      } else {
        res.json(data);
      }
    };
    next();
  };
}

module.exports = responseHandler;
