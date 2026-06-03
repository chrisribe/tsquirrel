const authService = require('../services/authService');

class AuthController {
  async login(req, res) {
    const { email, password } = req.body;
    
    try {
      const user = await authService.authenticateUser(email, password);
      
      if (!user) {
        // For HTMX, return just the error message
        if (req.headers['hx-request']) {
          return res.send('<p class="error">Invalid credentials</p>');
        }
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
      
      // For HTMX, redirect via header
      if (req.headers['hx-request']) {
        res.setHeader('HX-Redirect', '/galleries');
        return res.send('');
      }
      
      return res.redirect('/galleries');
    } catch (error) {
      if (req.headers['hx-request']) {
        return res.send(`<p class="error">${error.message}</p>`);
      }
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
      const user = await authService.authenticateUser(email, password);
      
      if (user) {
        req.session.user = {
          id: user.id,
          email: user.email,
          username: user.username,
          role: user.role
        };
        
        if (req.headers['hx-request']) {
          return res.respondWithTemplateOrJson({
            success: true,
            message: 'Registration successful!',
            redirect: '/galleries'
          });
        }
        
        return res.redirect('/galleries');
      }
      
      return res.respondWithTemplateOrJson({
        success: true,
        message: result.message,
        redirect: '/auth/login'
      }, 'auth/login');
    } catch (error) {
      if (req.headers['hx-request']) {
        return res.respondWithTemplateOrJson({ error: error.message });
      }
      
      return res.respondWithTemplateOrJson({
        error: error.message
      }, 'auth/register');
    }
  }
}

module.exports = new AuthController();
