const express = require('express');
const { Pool } = require('pg');

const router = express.Router();

const session = require('express-session');

const app = express();

// Set the view engine to ejs
app.set('view engine', 'ejs');

// Middleware to parse JSON bodies
app.use(express.json());

// Middleware to parse URL-encoded bodies (form data)
app.use(express.urlencoded({ extended: true }));

//TODO: review secret key docs
app.use(session({
  secret: 'your secret key',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false } // set to true if your website is on HTTPS
}));

// Enable CORS for all routes
const cors = require('cors');
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
app.use('/', require('./routes/web/index'));

//app.use('/', router);

app.use('/users', require('./routes/users'));
app.use('/auth', require('./routes/auth'));

// Add htmx routes to the app
app.use('/htmx', require('./routes/htmx'));


// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});