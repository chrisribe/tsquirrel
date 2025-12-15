class UserController {
  constructor(userDAO) {
    this.userDAO = userDAO;
    this.authService = require('../services/authService');
  }

  async getAllUsers(req, res, next, templatePath = 'admin/users') {
    try {
      const users = await this.userDAO.getAllUsers();
      res.respondWithTemplateOrJson({ users }, templatePath);
    } catch (err) {
      res.status(500).respondWithTemplateOrJson({ error: err.message });
    }
  }

  async addUser(req, res, next) {
    const { username, password, email } = req.body;
    try {
      await this.authService.createUser(username, password, email);
      res.status(200).respondWithTemplateOrJson({ message: 'User added successfully' });
    } catch (err) {
      res.status(500).respondWithTemplateOrJson({ error: err.message });
    }
  }

  async updateUser(req, res, next) {
    const { username, password, email } = req.body;
    const { id } = req.params;
    try {
      await this.authService.updateUser(id, { username, password, email });
      res.status(200).respondWithTemplateOrJson({ message: 'User updated successfully' });
    } catch (err) {
      res.status(500).respondWithTemplateOrJson({ error: err.message });
    }
  }

  async deleteUser(req, res, next) {
    const { id } = req.params;
    try {
      await this.userDAO.deleteUser(id);
      res.status(200).respondWithTemplateOrJson({ message: 'User deleted successfully' });
    } catch (err) {
      res.status(500).respondWithTemplateOrJson({ error: err.message });
    }
  }

  async updateUserStatus(req, res, next) {
    const { id } = req.params;
    const { status } = req.body;
    try {
      const user = await this.userDAO.updateUserStatus(id, status);
      res.respondWithTemplateOrJson({ user, message: 'Status updated' });
    } catch (err) {
      res.status(500).respondWithTemplateOrJson({ error: err.message });
    }
  }
}

module.exports = UserController;
