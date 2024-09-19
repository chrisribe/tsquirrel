// This file contains the allowed view templates for the server side rendering
// of htmx partials. This is used to prevent XSS attacks by only allowing a known list of templates.
const allowedViewTemplates = {
  'partials/userList': 'users',
  'partials/userListExp': 'users',
  'partials/userMessage': 'message',
  'partials/loginMsg': 'result',
  // Add other allowed templates here
};

module.exports = allowedViewTemplates;