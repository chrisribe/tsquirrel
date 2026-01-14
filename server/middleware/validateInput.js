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

  // For login - accepts email or username
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

  id: (value) => {
    const num = parseInt(value, 10);
    if (isNaN(num) || num < 1) return 'Invalid ID';
    return null;
  },

  status: (value) => {
    const validStatuses = ['active', 'paused', 'deleted'];
    if (!validStatuses.includes(value)) return 'Invalid status';
    return null;
  }
};

// Middleware factory - validates specified fields
function validate(rules) {
  return (req, res, next) => {
    const errors = [];
    
    for (const [field, validatorNames] of Object.entries(rules)) {
      // Get value from body or params
      const value = req.body[field] ?? req.params[field];
      
      // Handle array of validators or single validator
      const names = Array.isArray(validatorNames) ? validatorNames : [validatorNames];
      
      for (const name of names) {
        // Skip 'optional' if value is empty
        if (name === 'optional' && !value) break;
        if (name === 'optional') continue;
        
        const validator = validators[name];
        if (validator) {
          const error = validator(value);
          if (error) {
            errors.push({ field, message: error });
            break; // Stop at first error for this field
          }
        }
      }
    }
    
    if (errors.length > 0) {
      // For HTMX requests, we need to return HTML that the form can display
      // Check for a custom error template in the route or use generic response
      const errorData = { 
        error: errors[0].message,
        errors 
      };
      
      // If it's an HTMX request, return an error snippet
      if (req.headers['hx-request']) {
        return res.status(400).send(`
          <div class="error-message" role="alert">
            <p class="error">${errors[0].message}</p>
          </div>
        `);
      }
      
      return res.status(400).json(errorData);
    }
    
    next();
  };
}

module.exports = { validate, validators };
