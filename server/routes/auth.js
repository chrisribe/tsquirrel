const express = require('express');
const router = express.Router();
const authService = require('../services/authService');

router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const user = await authService.authenticateUser(username, password);

    if (user) {
      // If the login was successful, create a user session
      req.session.user = user;
      res.status(200).json({ message: 'Login successful' });
    } else {
      // If the login was not successful, send an error message
      res.status(401).json({ message: 'Invalid username or password' });
    }
  } catch (error) {
    // If there was an error, send an error message
    res.status(500).json({ message: `An error occurred ${error.message}` });
  }
});

module.exports = router;