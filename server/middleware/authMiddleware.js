// Auth Middleware
// Requires user to be logged in

module.exports = (req, res, next) => {
  if (!req.session.user) {
    if (req.accepts('html')) {
      return res.redirect('/auth/login');
    }
    return res.status(401).json({ message: 'Unauthorized' });
  }

  res.locals.userRole = req.session.user.role || 'user';
  next();
};
