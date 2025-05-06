const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const cors = require('cors');

// Create an async function for initialization
async function startServer() {
  const app = express();
  
  // Middleware setup
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use('/static', express.static(path.join(__dirname, 'static')));
  
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));
  
  // Database setup
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });
  app.set('pool', pool);
  app.use(cors());
  
  // Initialize services
  const authService = require('./services/authService');
  authService.initialize(pool);
  
  const SessionService = require('./services/SessionService');
  const sessionService = new SessionService(pool);
  await sessionService.initialize(app, pool);
  
  // Apply middlewares
  app.use(require('./middleware/responseHandler'));
  app.use(require('./middleware/sessionMiddleware'));  
  
  // Register routes
  app.use('/auth', require('./routes/auth'));
  app.use('/users', require('./routes/users'));
  app.use('/events', require('./routes/events'));
  app.use('/', require('./routes/web'));
  
  // Error handler
  app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).respondWithTemplateOrJson(
      { error: 'Something went wrong' }, 
      'errors/general-error'
    );
  });
  
  // Start server
  const port = process.env.PORT || 80;
  app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
  });
}

// Call the async function
startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});