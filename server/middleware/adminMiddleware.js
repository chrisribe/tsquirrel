// middleware/adminMiddleware.js
module.exports = (req, res, next) => {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(403).respondWithTemplateOrJson({
      error: 'Access denied'
    }, 'errors/unauthorized');
  }
  next();
};