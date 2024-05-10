const express = require('express');
const { Pool } = require('pg');
const router = require('./routes');
const cors = require('cors');

const app = express();

// Enable CORS for all routes
app.use(cors());

const port = process.env.PORT || 3000;

// Database connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Make the connection pool available to router
app.set('pool', pool);

// Use the router to handle all routes
app.use('/', router);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});