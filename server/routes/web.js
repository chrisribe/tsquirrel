const express = require('express');
const router = express.Router();
const checkPageExists = require('../middleware/checkPageExists');

// Specific routes first
router.get('/register', (req, res) => {
  res.render('layout-main', {
    template: 'auth/register',
    pageData: {},
    pageTitle: 'Register - EventGlimpse',
    noIndex: true
  });
});

// Auto-render pages based on URL (e.g., /about → about-page.ejs)
router.get('/*', checkPageExists);

module.exports = router;
