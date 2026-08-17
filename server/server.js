'use strict';

const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const ASSET_VERSION = '1.1.1';

async function startServer() {
  const app = express();

  // DB connection with retry
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  let connected = false, retries = 10;
  while (!connected && retries > 0) {
    try {
      await pool.query('SELECT 1');
      connected = true;
      console.log('Database connected');
    } catch (err) {
      console.log(`DB retry... ${--retries} left`);
      if (retries > 0) await new Promise(r => setTimeout(r, 2000));
      else throw err;
    }
  }

  const { runMigrations } = require('./services/MigrationService');
  await runMigrations(pool);

  // Middleware
  app.set('trust proxy', 1);
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use('/static', express.static(path.join(__dirname, 'static')));
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));
  app.set('pool', pool);
  const StoryAdminService = require('./services/StoryAdminService');
  app.set('storyAdminService', new StoryAdminService(pool));
  const SourceAdminService = require('./services/SourceAdminService');
  app.set('sourceAdminService', new SourceAdminService(pool));
  const TokenService = require('./services/TokenService');
  app.set('tokenService', new TokenService(pool));
  const SignalService = require('./services/SignalService');
  app.set('signalService', new SignalService(pool));
  const ApiStoryService = require('./services/ApiStoryService');
  app.set('apiStoryService', new ApiStoryService(pool));

  // Auth/session services
  const authService = require('./services/authService');
  authService.initialize(pool);

  const SessionService = require('./services/SessionService');
  const sessionService = new SessionService(pool);
  await sessionService.initialize(app);
  app.use(require('./middleware/sessionMiddleware'));
  app.use(require('./middleware/responseHandler'));

  // Security headers
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    if (process.env.NODE_ENV === 'production') {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  });

  // Category display helpers available in every template
  const { catMeta, catLabel, displaySourceName } = require('./lib/display');
  app.locals.catMeta = catMeta;
  app.locals.catLabel = catLabel;
  app.locals.displaySourceName = displaySourceName;

  // Inject globals into all views
  app.use(async (req, res, next) => {
    res.locals.assetVersion = process.env.NODE_ENV === 'development'
      ? Date.now().toString()
      : ASSET_VERSION;
    res.locals.googleAnalyticsId = process.env.GOOGLE_ANALYTICS_ID || '';
    res.locals.nutsToday = 0;
    if (!req.path.startsWith('/api') && !req.path.startsWith('/static')) {
      try {
        const { rows } = await pool.query(
          "SELECT COUNT(*)::int AS n FROM stories WHERE created_at > NOW() - INTERVAL '24 hours'"
        );
        res.locals.nutsToday = rows[0]?.n || 0;
      } catch (_) { /* non-fatal — header just shows 0 */ }
    }
    next();
  });

  // Health check
  app.get('/health', (req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));
  app.get('/robots.txt', (req, res) => res.sendFile(path.join(__dirname, 'static', 'robots.txt')));

  // Routes
  app.use('/auth', require('./routes/auth'));
  app.use('/admin', require('./routes/admin'));
  app.use('/api/v1', require('./routes/api'));
  app.use('/', require('./routes/web'));

  // Error handlers
  app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).render('layout-main', {
      template: 'errors/general-error',
      pageTitle: 'Error — TSquirrel',
      pageData: { error: 'Something went wrong' },
    });
  });
  app.use((req, res) => {
    res.status(404).render('layout-main', {
      template: 'errors/404',
      pageTitle: '404 — TSquirrel',
      pageData: {},
    });
  });

  // Start cron
  if (process.env.NODE_ENV !== 'test') {
    const { startCron } = require('./services/CronService');
    startCron(pool);
  }

  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`TSquirrel listening on :${port}`));
}

startServer().catch(err => {
  console.error('Failed to start:', err);
  process.exit(1);
});
