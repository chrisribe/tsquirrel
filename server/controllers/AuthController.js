const authService = require('./../services/authService');

class AuthController {
  async login(req, res) {
    const { username, password } = req.body;

    try {
      const user = await authService.authenticateUser(username, password);

      if (user) {
        req.session.user = {id : user.id, username: user.username};
        res.locals.user = req.session.user;
        res.status(200).respondWithTemplateOrJson({ message: 'Login successful' });
      } else {
        res.status(401).json({ message: 'Invalid username or password' });
      }
    } catch (error) {
      res.status(500).json({ message: `An error occurred ${error.message}` });
    }
  }

  async logout(req, res) {
    req.session.destroy();
    res.status(200).respondWithTemplateOrJson({ message: 'Logout successful' });
  }

  async register(req, res) {
    const { username, password, email } = req.body;

    try {
      const result = await authService.registerUser(username, password, email);
      res.status(200).respondWithTemplateOrJson(result);
    } catch (error) {
      res.status(500).json({ message: `An error occurred: ${error.message}`, error });
    }
  }
}

module.exports = new AuthController();