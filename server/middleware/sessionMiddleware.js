// Middleware to attach session user data to response locals
// This middleware function takes the current req.session.user and assigns it to res.locals.user.
// This ensures that the user data stored in the session is available in the response locals,
// which can then be accessed in the EJS templates for rendering personalized content.

module.exports = (req, res, next) => {
  // Safely access user data, use empty object if session doesn't exist
  res.locals.user = req.session?.user || null;
  
  // Safely add isAuthenticated helper
  res.locals.isAuthenticated = !!req.session?.user;
  
  next();
};