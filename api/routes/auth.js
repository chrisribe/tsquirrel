const express = require('express');
const router = express.Router();

// Import the authenticateUser function
// This function should take a username and password, check them against your database, and return a user object if the login is successful
//const { authenticateUser } = require('./auth');

router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const user = {id:1, uname: "bob"}; //await authenticateUser(username, password);

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
    res.status(500).json({ message: 'An error occurred' });
  }
});

module.exports = router;