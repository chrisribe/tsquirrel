const express = require('express');
const router = express.Router();
const authController = require('./../controllers/AuthController');

// Login routes
router.get('/login', (req, res) => {
  res.respondWithTemplateOrJson({}, 'auth/login');
});
router.post('/login', authController.login);

// Logout route
router.get('/logout', authController.logout);

module.exports = router;