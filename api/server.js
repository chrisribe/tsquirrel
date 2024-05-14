const express = require('express');
const bodyParser = require('body-parser');
const { Pool } = require('pg');

const router = express.Router();
const usersRouter = require('./routes/users');
const authRouter = require('./routes/auth');

const app = express();
// Use body-parser middleware
app.use(bodyParser.json());

// Enable CORS for all routes
const cors = require('cors');
app.use(cors());

const port = process.env.PORT || 3000;

// Database connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Make the connection pool available to router
app.set('pool', pool);

// Add routes to the app
router.get('/', (req, res) => {
  res.send('Welcome to EventGlimpse! <a href="/users">Show Users</a>');
});
app.use('/', router);

app.use('/users', usersRouter);
app.use('/auth', authRouter);


// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});