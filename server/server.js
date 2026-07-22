'use strict';

const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const ASSET_VERSION = '1.1.0';

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
  const { catMeta, catLabel } = require('./lib/display');
  app.locals.catMeta = catMeta;
  app.locals.catLabel = catLabel;

  // Inject globals into all views
  app.use(async (req, res, next) => {
    res.locals.assetVersion = ASSET_VERSION;
    res.locals.user = null; // no auth for MVP
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
