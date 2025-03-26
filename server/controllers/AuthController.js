const authService = require('./../services/authService');

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
        username: user.username
      };
      
      return res.respondWithTemplateOrJson({
        success: true,
        user: req.session.user,
        redirect: '/dashboard'
      }, 'dashboard/index');
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
}

module.exports = new AuthController();