const UserDAO = require('./../dao/UserDAO');

class ProfileController {
  constructor(userDAO) {
    this.userDAO = userDAO;
  }

  async getProfile(req, res, next) {
    const { id } = req.params;
    try {
      const userProfile = await this.userDAO.getUserById(id);
      res.respondWithTemplateOrJson(userProfile);
    } catch (err) {
      res.status(500).json(err);
      next(err);
    }
  }

  async updateProfile(req, res, next) {
    const { id } = req.params;
    const profileData = req.body;
    try {
      await this.userDAO.updateUserProfile(id, profileData);
      res.status(200).respondWithTemplateOrJson({ message: 'Profile updated successfully' });
    } catch (err) {
      res.status(500).json(err);
      next(err);
    }
  }
}

module.exports = ProfileController;