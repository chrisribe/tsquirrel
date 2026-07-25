'use strict';

// Admin Middleware
// Requires user to have admin role

module.exports = (req, res, next) => {
  if (!req.session.user || req.session.user.role !== 'admin') {
    if (req.accepts('html')) {
      return res.status(403).render('layout-main', {
        template: 'errors/unauthorized',
        pageTitle: 'Access Denied — TSquirrel',
        pageData: {},
      });
    }
    return res.status(403).json({ error: 'Access denied' });
  }
  next();
};
