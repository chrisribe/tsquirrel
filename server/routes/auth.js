const express = require('express');
const router = express.Router();
const authService = require('./../services/authService');

router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const user = await authService.authenticateUser(username, password);

    if (user) {
      // If the login was successful, create a user session
      req.session.user = user;
      res.locals.user = user; // Set the user data to res.locals
      res.status(200).respondWithTemplateOrJson({ message: 'Login successful' });
    } else {
      // If the login was not successful, send an error message
      res.status(401).respondWithTemplateOrJson({ message: 'Invalid username or password' });
    }
  } catch (error) {
    // If there was an error, send an error message
    res.status(500).respondWithTemplateOrJson({ message: `An error occurred ${error.message}` });
  }
});

module.exports = router;