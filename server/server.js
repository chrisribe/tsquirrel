const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const cors = require('cors');

async function startServer() {
  const app = express();
  
  // Database connection with retry logic
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });
  
  let connected = false;
  let retries = 10;
  
  while (!connected && retries > 0) {
    try {
      await pool.query('SELECT 1');
      connected = true;
      console.log('Database connected successfully');
    } catch (err) {
      console.log(`Database connection attempt failed. Retries left: ${retries - 1}`);
      retries--;
      if (retries > 0) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      } else {
        throw err;
      }
    }
  }
  
  // Middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use('/static', express.static(path.join(__dirname, 'static')));
  
  // View engine
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));
  
  // Make pool available to routes
  app.set('pool', pool);
  
  // Security headers
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    if (process.env.NODE_ENV === 'production') {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  });
  
  // CORS - configure CORS_ORIGIN in production (e.g., https://yourdomain.com)
  const corsOrigin = process.env.CORS_ORIGIN;
  app.use(cors({
    origin: corsOrigin || false,  // Disabled if not explicitly set
    credentials: !!corsOrigin     // Only allow credentials if origin is set
  }));
  
  // Initialize services
  const authService = require('./services/authService');
  authService.initialize(pool);
  
  const SessionService = require('./services/SessionService');
  const sessionService = new SessionService(pool);
  await sessionService.initialize(app, pool);
  
  // Apply middleware
  app.use(require('./middleware/responseHandler'));
  app.use(require('./middleware/sessionMiddleware'));  
  
  // Health check (before auth routes)
  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // robots.txt (serve from root)
  app.get('/robots.txt', (req, res) => {
    res.sendFile(path.join(__dirname, 'static', 'robots.txt'));
  });
  
  // Routes
  app.use('/auth', require('./routes/auth'));
  app.use('/users', require('./routes/users'));
  app.use('/admin', require('./routes/admin'));
  app.use('/galleries', require('./routes/galleries'));
  app.use('/g', require('./routes/galleries'));  // Short public URL
  app.use('/', require('./routes/web'));
  
  // Error handler
  app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).respondWithTemplateOrJson(
      { error: 'Something went wrong' }, 
      'errors/general-error'
    );
  });

  // 404 handler (must be last)
  app.use((req, res) => {
    res.status(404).respondWithTemplateOrJson(
      { error: 'Page not found' },
      'errors/404'
    );
  });
  
  // Start server
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
