const authService = require('./../services/authService');

class AuthController {
  async login(req, res) {
    const { email, password } = req.body;
    
    try {
      const user = await authService.authenticateUser(email, password);
      //console.log("User found:", user);
      
      if (!user) {
        //console.log("Invalid credentials");
        return res.respondWithTemplateOrJson({
          error: 'Invalid credentials'
        }, 'auth/login');
      }
      
      req.session.user = {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role
      };
      
      return res.respondWithTemplateOrJson({
        success: true,
        user: req.session.user,
        redirect: '/events'
      }, 'events');
    } catch (error) {
      return res.respondWithTemplateOrJson({
        error: error.message
      }, 'auth/login');
    }
  }

  async logout(req, res) {
    req.session.destroy((err) => {
      if (err) {
        return res.respondWithTemplateOrJson({
          error: 'Logout failed'
        }, 'auth/login');
      }
      
      return res.respondWithTemplateOrJson({
        message: 'Logged out successfully',
        redirect: '/auth/login'
      }, 'auth/login');
    });
  }

  async register(req, res) {
    const { username, password, email } = req.body;
    
    try {
      const result = await authService.registerUser(username, password, email);
      
      // Auto-login the user after successful registration
      const user = await authService.authenticateUser(email, password);
      
      if (user) {
        req.session.user = {
          id: user.id,
          email: user.email,
          username: user.username,
          role: user.role
        };
        
        // For HTMX requests, return success message and let the redirect handle navigation
        if (req.headers['hx-request']) {
          return res.respondWithTemplateOrJson({
            success: true,
            message: 'Registration successful! Redirecting to your events...',
            redirect: '/events'
          });
        }
        
        // For regular requests, redirect directly
        return res.redirect('/events');
      } else {
        // Fallback: redirect to login if auto-login fails
        if (req.headers['hx-request']) {
          return res.respondWithTemplateOrJson({
            success: true,
            message: result.message + ' Please log in to continue.',
            redirect: '/auth/login'
          });
        }
        
        return res.respondWithTemplateOrJson({
          success: true,
          message: result.message,
          redirect: '/auth/login'
        }, 'auth/login');
      }
    } catch (error) {
      // For HTMX requests, return JSON error
      if (req.headers['hx-request']) {
        return res.respondWithTemplateOrJson({
          error: error.message
        });
      }
      
      // For regular requests, render the register page with error
      return res.respondWithTemplateOrJson({
        error: error.message
      }, 'auth/register');
    }
  }
}

module.exports = new AuthController();