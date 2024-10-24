const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const cors = require('cors');
const responseHandler = require('./middleware/responseHandler');

const app = express();

// Middleware to parse JSON bodies
app.use(express.json());

// Middleware to parse URL-encoded bodies (form data)
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use('/static', express.static(path.join(__dirname, 'static')));

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

// Apply the responseHandler middleware
app.use(responseHandler());

// Set the view engine to ejs
app.set('view engine', 'ejs');
// Set the views directory to be used on .render calls
app.set('views', path.join(__dirname, 'views'));

// Database connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});
// Make the connection pool available to router
app.set('pool', pool);
// Enable CORS for all routes
app.use(cors());

const port = process.env.PORT || 80;

// initialize the auth service
const authService = require('./services/authService');
authService.initialize(pool);

const sessionService = require('./services/sessionService');
sessionService.initialize(app, pool);

// Add API routes to the app
app.use('/api/users', require('./routes/users'));
app.use('/api/auth', require('./routes/auth'));

app.use('/events', require('./routes/events'));

// Add web routes to the app
app.use('/', require('./routes/web'));

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});