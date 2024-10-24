const express = require('express');
const router = express.Router();

const checkPageExists = require('../middleware/checkPageExists');

// public routes only

// Use the checkPageExists function for all routes
// Example url name /about-us should have a corresponding 
// about-us-page.ejs file in the views folder
router.get('/*', checkPageExists);

module.exports = router;