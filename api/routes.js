const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  res.send('Hello, World! <a href="/showUsers">Show Users</a>');
});

router.get('/showUsers', async (req, res, next) => {
  const pool = req.app.get('pool');
  try {
    const results = await pool.query('SELECT * FROM users');
    res.json(results.rows);
    //res.send('<pre>' + JSON.stringify(results.rows, null, 2) + '</pre>');
  } catch (err) {
    res.status(500).json(err);
    //console.error(err);
    next(err);
  }
});

module.exports = router;