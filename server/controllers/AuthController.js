const authService = require('../services/authService');

class AuthController {
  async login(req, res) {
    const { email, password } = req.body;
    
    try {
      const user = await authService.authenticateUser(email, password);
      
      if (!user) {
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
        redirect: '/dashboard'
      }, 'dashboard-page');
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
            redirect: '/dashboard'
          });
        }
        
        return res.redirect('/dashboard');
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
