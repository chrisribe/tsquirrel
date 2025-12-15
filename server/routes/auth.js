const express = require('express');
const router = express.Router();
const authController = require('../controllers/AuthController');
const { validate } = require('../middleware/validateInput');
const { loginLimiter, registerLimiter } = require('../middleware/rateLimiter');

router.get('/login', (req, res) => {
  res.respondWithTemplateOrJson({}, 'auth/login');
});

router.post('/login', 
  loginLimiter,
  validate({ email: 'emailOrUsername', password: 'password' }),
  authController.login
);

router.post('/register',
  registerLimiter,
  validate({ username: 'username', email: 'email', password: 'password' }),
  authController.register
);

router.post('/logout', authController.logout);

module.exports = router;
