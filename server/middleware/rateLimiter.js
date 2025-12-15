// Simple in-memory rate limiter
// For production, consider redis-based solution for multi-instance support

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
      // New window
      data = { count: 1, firstAttempt: now, windowMs };
      attempts.set(key, data);
      return next();
    }
    
    data.count++;
    
    if (data.count > max) {
      const retryAfter = Math.ceil((data.firstAttempt + windowMs - now) / 1000);
      res.set('Retry-After', retryAfter);
      return res.status(429).respondWithTemplateOrJson({ 
        error: message,
        retryAfter 
      });
    }
    
    next();
  };
}

// Pre-configured limiters for common use cases
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 10,
  message: 'Too many login attempts, please try again in 15 minutes'
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,  // 1 hour
  max: 5,
  message: 'Too many accounts created, please try again later'
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,  // 1 minute
  max: 60,
  message: 'Too many requests, please slow down'
});

module.exports = { rateLimit, loginLimiter, registerLimiter, apiLimiter };
