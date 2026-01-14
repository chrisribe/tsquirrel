const UserDAO = require('../dao/UserDAO');

class AdminController {
  constructor(userDAO) {
    this.userDAO = userDAO;
  }

  async dashboard(req, res) {
    try {
      const users = await this.userDAO.getUsersWithStats();
      res.respondWithTemplateOrJson({ users }, 'admin/dashboard');
    } catch (error) {
      res.status(500).respondWithTemplateOrJson({ error: error.message }, 'errors/general-error');
    }
  }

  async updateUserStatus(req, res) {
    const { userId } = req.params;
    const { status } = req.body;
    
    // Prevent admin from deactivating themselves
    if (parseInt(userId, 10) === req.session.user.id && status !== 'active') {
      const errorMsg = 'Cannot deactivate your own account';
      if (req.headers['hx-request']) {
        return res.status(400).send(`<div class="error-message" role="alert"><p class="error">${errorMsg}</p></div>`);
      }
      return res.status(400).json({ error: errorMsg });
    }
    
    try {
      const user = await this.userDAO.updateUserStatus(userId, status);
      res.respondWithTemplateOrJson({ user }, 'admin/user-row');
    } catch (error) {
      if (req.headers['hx-request']) {
        return res.status(500).send(`<div class="error-message" role="alert"><p class="error">${error.message}</p></div>`);
      }
      res.status(500).json({ error: error.message });
    }
  }
}

module.exports = AdminController;
