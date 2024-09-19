// Middleware to attach session user data to response locals
// This middleware function takes the current req.session.user and assigns it to res.locals.user.
// This ensures that the user data stored in the session is available in the response locals,
// which can then be accessed in the EJS templates for rendering personalized content.

module.exports = (req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
};