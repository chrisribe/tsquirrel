module.exports = (req, res, next) => {
  console.log('Auth middleware', req.session.user);
  if (!req.session.user) {
    // If the request expects HTML, redirect to login page
    if (req.accepts('html')) {
      return res.redirect('/login');
    }
    // Otherwise, return a 401 Unauthorized response
    return res.status(401).json({ message: 'Unauthorized' });
  }
  next();
};