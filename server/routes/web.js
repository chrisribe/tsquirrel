const express = require('express');
const router = express.Router();

const checkPageExists = require('../middleware/checkPageExists');

// Specific routes first with explicit templates
router.get('/register', (req, res) => {
  res.respondWithTemplateOrJson({}, 'auth/register');
});

// Use the checkPageExists function for all routes
// Example url name /about-us should have a corresponding 
// about-us-page.ejs file in the views folder
router.get('/*', checkPageExists);

module.exports = router;