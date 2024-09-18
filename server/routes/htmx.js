const express = require('express');
const router = express.Router();

router.get('/login', async (req, res) => {

  res.send('<p>Login page!</p>');
});

module.exports = router;