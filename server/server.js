const express = require('express');
const { Pool } = require('pg');
const session = require('express-session');
const path = require('path');
const cors = require('cors');
const responseHandler = require('./middleware/responseHandler');
const sessionMiddleware = require('./middleware/sessionMiddleware');

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


//TODO: review secret key docs
// Session middleware
app.use(session({
  secret: 'your secret key',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false } // set to true if your website is on HTTPS
}));
// Apply the session data middleware
app.use(sessionMiddleware);

// Enable CORS for all routes
app.use(cors());

const port = process.env.PORT || 80;

// Database connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Make the connection pool available to router
app.set('pool', pool);

// initialize the auth service
const authService = require('./services/authService');
authService.initialize(pool);

// Add web routes to the app
app.use('/', require('./routes/web'));

// Add API routes to the app
app.use('/api/users', require('./routes/users'));
app.use('/api/auth', require('./routes/auth'));

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});