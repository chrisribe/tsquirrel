'use strict';

// Simple in-memory rate limiter
// For production, consider a redis-based solution for multi-instance support

const attempts = new Map();

// Clean up old entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of attempts) {
    if (now - data.firstAttempt > data.windowMs) {
      attempts.delete(key);
    }
  }
}, 10 * 60 * 1000);

/**
 * Rate limiter middleware factory
 * @param {Object} options
 * @param {number} options.windowMs - Time window in milliseconds (default: 15 min)
 * @param {number} options.max - Max attempts per window (default: 5)
 * @param {string} options.message - Error message
 * @param {function} options.keyGenerator - Function to generate unique key (default: IP)
 */
function rateLimit({
  windowMs = 15 * 60 * 1000,  // 15 minutes
  max = 5,
  message = 'Too many attempts, please try again later',
  keyGenerator = (req) => req.ip
} = {}) {
  return (req, res, next) => {
    const key = keyGenerator(req);
    const now = Date.now();

    let data = attempts.get(key);

    if (!data || now - data.firstAttempt > windowMs) {
      data = { count: 1, firstAttempt: now, windowMs };
      attempts.set(key, data);
      return next();
    }

    data.count++;

    if (data.count > max) {
      const retryAfter = Math.ceil((data.firstAttempt + windowMs - now) / 1000);
      res.set('Retry-After', retryAfter);
      if (req.accepts('html')) {
        return res.status(429).render('layout-main', {
          template: 'auth/login',
          pageTitle: 'Login — TSquirrel',
          noIndex: true,
          pageData: { error: message },
        });
      }
      return res.status(429).json({ error: message, retryAfter });
    }

    next();
  };
}

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5, message: 'Too many login attempts, please try again later' });
const registerLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 3, message: 'Too many attempts, please try again later' });

module.exports = { rateLimit, loginLimiter, registerLimiter };
