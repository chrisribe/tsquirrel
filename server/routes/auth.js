'use strict';

const express = require('express');
const router = express.Router();
const authController = require('../controllers/AuthController');
const { validate } = require('../middleware/validateInput');
const { loginLimiter } = require('../middleware/rateLimiter');

router.get('/login', (req, res) => {
  res.render('layout-main', {
    template: 'auth/login',
    pageTitle: 'Login — TSquirrel',
    noIndex: true,
    pageData: {},
  });
});

router.post('/login',
  loginLimiter,
  validate({ email: 'emailOrUsername', password: 'password' }),
  authController.login
);

router.post('/logout', authController.logout);

module.exports = router;
