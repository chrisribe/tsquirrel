const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  res.render('index-page');
});

router.get('/login', (req, res) => {
  res.render('auth/login-page');
});

router.get('/register', (req, res) => {
  res.render('auth/register-page');
});

router.get('/demos', (req, res) => {
  res.render('demos-page');
});

module.exports = router;