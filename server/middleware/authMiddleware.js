module.exports = (req, res, next) => {
  if (!req.session.user) {
    // If the request expects HTML, redirect to login page
    if (req.accepts('html')) {
      return res.redirect('/auth/login');
    }
    // Otherwise, return a 401 Unauthorized response
    return res.status(401).json({ message: 'Unauthorized' });
  }

  // Add role to locals for easy access in templates
  res.locals.userRole = req.session.user.role || 'user';

  next();
};