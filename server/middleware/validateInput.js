'use strict';

// Input Validation Middleware
// Simple validation helpers for common inputs

const validators = {
  email: (value) => {
    if (!value || typeof value !== 'string') return 'Email is required';
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value)) return 'Invalid email format';
    if (value.length > 254) return 'Email too long';
    return null;
  },

  // For login — accepts email or username
  emailOrUsername: (value) => {
    if (!value || typeof value !== 'string') return 'Email or username is required';
    if (value.length > 254) return 'Input too long';
    if (value.length < 3) return 'Input too short';
    return null;
  },

  password: (value) => {
    if (!value || typeof value !== 'string') return 'Password is required';
    if (value.length < 8) return 'Password must be at least 8 characters';
    if (value.length > 128) return 'Password too long';
    return null;
  },

  username: (value) => {
    if (!value || typeof value !== 'string') return 'Username is required';
    if (value.length < 3) return 'Username must be at least 3 characters';
    if (value.length > 60) return 'Username too long';
    if (!/^[a-zA-Z0-9_-]+$/.test(value)) return 'Username can only contain letters, numbers, underscores, and hyphens';
    return null;
  },
};

// Middleware factory — validates specified fields
function validate(rules) {
  return (req, res, next) => {
    const errors = [];

    for (const [field, validatorNames] of Object.entries(rules)) {
      const value = req.body[field] ?? req.params[field];
      const names = Array.isArray(validatorNames) ? validatorNames : [validatorNames];

      for (const name of names) {
        const validatorFn = validators[name];
        if (!validatorFn) continue;
        const error = validatorFn(value);
        if (error) {
          errors.push({ field, message: error });
          break;
        }
      }
    }

    if (errors.length > 0) {
      if (req.accepts('html')) {
        return res.status(400).render('layout-main', {
          template: 'auth/login',
          pageTitle: 'Login — TSquirrel',
          noIndex: true,
          pageData: { error: errors[0].message },
        });
      }
      return res.status(400).json({ errors });
    }

    next();
  };
}

module.exports = { validate, validators };
