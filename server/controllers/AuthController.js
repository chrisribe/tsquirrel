'use strict';

const authService = require('../services/authService');

class AuthController {
  async login(req, res) {
    const { email, password } = req.body;

    try {
      const user = await authService.authenticateUser(email, password);

      if (!user) {
        return res.render('layout-main', {
          template: 'auth/login',
          pageTitle: 'Login — TSquirrel',
          noIndex: true,
          pageData: { error: 'Invalid credentials' },
        });
      }

      req.session.user = {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
      };

      return res.redirect('/admin');
    } catch (error) {
      return res.render('layout-main', {
        template: 'auth/login',
        pageTitle: 'Login — TSquirrel',
        noIndex: true,
        pageData: { error: error.message },
      });
    }
  }

  async logout(req, res) {
    req.session.destroy((err) => {
      if (err) {
        return res.redirect('/admin');
      }
      return res.redirect('/auth/login');
    });
  }
}

module.exports = new AuthController();
