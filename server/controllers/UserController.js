// UserController.js

class UserController {
  constructor(userDAO) {
    this.userDAO = userDAO;
  }

  async getAllUsers(req, res, next) {
    try {
      const users = await this.userDAO.getAllUsers();
      res.respondWithTemplateOrJson(users);
    } catch (err) {
      res.status(500).json(err);
      next(err);
    }
  }

  async addUser(req, res, next) {
    const { username, password, email } = req.body;
    try {
      await this.userDAO.addUser({ username, password, email} );
      res.status(200).respondWithTemplateOrJson({ message: 'User added successfully' });
    } catch (err) {
      res.status(500).json(err);
      next(err);
    }
  }

  async updateUser(req, res, next) {
    const { username, password, email } = req.body;
    const { id } = req.params;
    try {
      await this.userDAO.updateUser({ username, password, email, id });
      res.status(200).respondWithTemplateOrJson({ message: 'User updated successfully' });
    } catch (err) {
      res.status(500).json(err);
      next(err);
    }
  }

  async deleteUser(req, res, next) {
    const { id } = req.params;
    try {
      await this.userDAO.deleteUser(id);
      res.status(200).respondWithTemplateOrJson({ message: 'User deleted successfully' });
    } catch (err) {
      res.status(500).json(err);
      next(err);
    }
  }
}

module.exports = UserController;