const authService = require('./../services/authService');

class AuthController {
  async login(req, res) {
    const { username, password } = req.body;

    try {
      const user = await authService.authenticateUser(username, password);

      if (user) {
        req.session.user = user;
        res.locals.user = user;
        res.status(200).respondWithTemplateOrJson({ message: 'Login successful' });
      } else {
        res.status(401).respondWithTemplateOrJson({ message: 'Invalid username or password' });
      }
    } catch (error) {
      res.status(500).respondWithTemplateOrJson({ message: `An error occurred ${error.message}` });
    }
  }

  async register(req, res) {
    const { username, password, email } = req.body;

    try {
      const result = await authService.registerUser(username, password, email);
      res.status(200).respondWithTemplateOrJson(result);
    } catch (error) {
      res.status(500).respondWithTemplateOrJson({ message: `An error occurred: ${error.message}` });
    }
  }
}

module.exports = new AuthController();