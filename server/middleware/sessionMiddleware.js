// Session Middleware
// Attaches session user data to response locals for use in templates

module.exports = (req, res, next) => {
  res.locals.user = req.session?.user || null;
  res.locals.isAuthenticated = !!req.session?.user;
  next();
};
