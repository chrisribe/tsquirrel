'use strict';

const crypto = require('crypto');

function csrfToken(req, res, next) {
  if (req.session && !req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(32).toString('base64url');
  res.locals.csrfToken = req.session?.csrfToken || '';
  next();
}

function requireCsrf(req, res, next) {
  const expected = req.session?.csrfToken || '';
  const provided = String(req.body?._csrf || '');
  const valid = expected && provided && expected.length === provided.length
    && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
  if (valid) return next();
  const error = new Error('Your form expired. Reload the page and try again.');
  error.status = 403;
  return next(error);
}

module.exports = { csrfToken, requireCsrf };
