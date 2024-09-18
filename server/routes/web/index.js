const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  res.render('index'); // Render the index.ejs template
});

router.get('/login', (req, res) => {
  res.render('auth/login'); // Render the index.ejs template
});

module.exports = router;