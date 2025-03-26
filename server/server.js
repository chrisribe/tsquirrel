const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const cors = require('cors');

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
app.use(require('./middleware/responseHandler'));
app.use(require('./middleware/sessionMiddleware'));

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


// initialize the auth service
const authService = require('./services/authService');
authService.initialize(pool);

const sessionService = require('./services/sessionService');
sessionService.initialize(app, pool);

// Consolidated routes
app.use('/', require('./routes/auth'));
app.use('/users', require('./routes/users'));
app.use('/events', require('./routes/events'));
//app.use('/', require('./routes/pages'));


const port = process.env.PORT || 80;
app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});