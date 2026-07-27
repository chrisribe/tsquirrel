/**
 * MigrationService — TSquirrel
 * Tracks versions in schema_migrations. Idempotent DDL (IF NOT EXISTS).
 */

const migrations = [
  {
    version: 1,
    description: 'Baseline — sessions + secrets',
    up: async (pool) => {
      console.log('Migration 1: Baseline schema marked');
    }
  },
  {
    version: 2,
    description: 'News schema — sources, articles, stories',
    up: async (pool) => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS sources (
          id SERIAL PRIMARY KEY,
          name VARCHAR(100) NOT NULL,
          slug VARCHAR(100) UNIQUE NOT NULL,
          url VARCHAR(500) NOT NULL,
          feed_url VARCHAR(500),
          type VARCHAR(20) DEFAULT 'rss',
          active BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS articles (
          id SERIAL PRIMARY KEY,
          source_id INTEGER REFERENCES sources(id),
          external_id VARCHAR(255),
          title TEXT NOT NULL,
          url TEXT NOT NULL,
          published_at TIMESTAMP,
          fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(source_id, external_id)
        )
      `);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_articles_published ON articles(published_at DESC)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_articles_source ON articles(source_id)`);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS stories (
          id SERIAL PRIMARY KEY,
          title TEXT NOT NULL,
          slug VARCHAR(255) UNIQUE NOT NULL,
          summary TEXT,
          category VARCHAR(50),
          tags TEXT[],
          sentiment NUMERIC(3,2),
          heat_score INTEGER DEFAULT 0,
          image_url TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          is_featured BOOLEAN DEFAULT FALSE
        )
      `);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_stories_created ON stories(created_at DESC)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_stories_heat ON stories(heat_score DESC)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_stories_category ON stories(category)`);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS story_articles (
          story_id INTEGER REFERENCES stories(id) ON DELETE CASCADE,
          article_id INTEGER REFERENCES articles(id) ON DELETE CASCADE,
          PRIMARY KEY (story_id, article_id)
        )
      `);
      console.log('Migration 2: News schema created');
    }
  },
  {
    version: 3,
    description: 'Seed default sources',
    up: async (pool) => {
      await pool.query(`
        INSERT INTO sources (name, slug, url, feed_url, type) VALUES
          ('Hacker News',    'hackernews',  'https://news.ycombinator.com',  NULL,                                                  'hn'),
          ('BBC News',       'bbc',         'https://www.bbc.com/news',      'https://feeds.bbci.co.uk/news/rss.xml',               'rss'),
          ('Reuters',        'reuters',     'https://www.reuters.com',       'https://feeds.reuters.com/reuters/topNews',           'rss'),
          ('The Guardian',   'guardian',    'https://www.theguardian.com',   'https://www.theguardian.com/world/rss',               'rss'),
          ('Ars Technica',   'arstechnica', 'https://arstechnica.com',       'https://feeds.arstechnica.com/arstechnica/index',     'rss'),
          ('TechCrunch',     'techcrunch',  'https://techcrunch.com',        'https://techcrunch.com/feed/',                        'rss')
        ON CONFLICT (slug) DO NOTHING
      `);
      console.log('Migration 3: Default sources seeded');
    }
  },
  {
    version: 4,
    description: 'Legacy articles — 65 original tsquirrel.com indexed URLs',
    up: async (pool) => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS legacy_articles (
          id INTEGER PRIMARY KEY,
          slug VARCHAR(300) UNIQUE NOT NULL,
          title TEXT NOT NULL,
          description TEXT,
          source_url TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      // Insert all 65 legacy articles
      const fs = require('fs');
      const path = require('path');
      const sql = fs.readFileSync(path.join(__dirname, '../../db/03-legacy.sql'), 'utf8');
      // Run only the INSERT portion (skip the CREATE TABLE which we already ran)
      const insertPart = sql.split('INSERT INTO')[1];
      if (insertPart) {
        await pool.query('INSERT INTO' + insertPart);
      }
      console.log('Migration 4: Legacy articles table + 65 rows seeded');
    }
  },
  {
    version: 5,
    description: 'Add stories.squirrel_take — editorial one-liner',
    up: async (pool) => {
      await pool.query(`ALTER TABLE stories ADD COLUMN IF NOT EXISTS squirrel_take TEXT`);
      console.log('Migration 5: stories.squirrel_take added');
    }
  },
  {
    version: 6,
    description: 'Users table — admin auth (user_session/session_secrets already exist from 01-init.sql)',
    up: async (pool) => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          username VARCHAR(60) UNIQUE NOT NULL,
          password VARCHAR(255) NOT NULL,
          email VARCHAR(254) UNIQUE NOT NULL,
          role VARCHAR(20) DEFAULT 'user',
          status VARCHAR(20) DEFAULT 'active',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_users_status ON users(status)`);
      console.log('Migration 6: users table created');
    }
  },
  {
    version: 7,
    description: 'Seed Google Trends CA source (type trends)',
    up: async (pool) => {
      await pool.query(`
        INSERT INTO sources (name, slug, url, feed_url, type) VALUES
          ('Google Trends (Canada)', 'google-trends-ca', 'https://trends.google.com/trending?geo=CA', NULL, 'trends')
        ON CONFLICT (slug) DO NOTHING
      `);
      console.log('Migration 7: Google Trends CA source seeded');
    }
  },
  {
    version: 8,
    description: 'Story publishing lifecycle — status/author/published_at + api_tokens; hide existing auto-generated stories',
    up: async (pool) => {
      await pool.query(`
        ALTER TABLE stories
          ADD COLUMN IF NOT EXISTS status       VARCHAR(20) DEFAULT 'draft',
          ADD COLUMN IF NOT EXISTS author_type  VARCHAR(20),
          ADD COLUMN IF NOT EXISTS author_id    TEXT,
          ADD COLUMN IF NOT EXISTS published_at TIMESTAMP
      `);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_stories_status_published ON stories(status, published_at DESC)`);
      // Cutover: existing auto-generated stories were never human-reviewed → hide them.
      // (Nothing unreviewed stays live. Publish the good ones from /admin/stories.)
      await pool.query(`UPDATE stories SET status = 'hidden' WHERE status IS NULL OR status = 'draft'`);
      // Revocable per-agent API tokens (for future /api/v1 external contributors).
      await pool.query(`
        CREATE TABLE IF NOT EXISTS api_tokens (
          id         SERIAL PRIMARY KEY,
          label      VARCHAR(100) NOT NULL,
          token_hash VARCHAR(255) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          revoked_at TIMESTAMP
        )
      `);
      console.log('Migration 8: story lifecycle columns + api_tokens; existing stories hidden');
    }
  },
  {
    version: 9,
    description: 'Add articles.description — captured from RSS description/summary for search + disambiguation in admin picker',
    up: async (pool) => {
      await pool.query(`ALTER TABLE articles ADD COLUMN IF NOT EXISTS description TEXT`);
      console.log('Migration 9: articles.description added');
    }
  },
  {
    version: 10,
    description: 'Limit active sources for initial testing (keep hackernews + bbc, deactivate the rest); ingest is now hourly-scale not every 30min',
    up: async (pool) => {
      await pool.query(`
        UPDATE sources SET active = FALSE
        WHERE slug NOT IN ('hackernews', 'bbc')
      `);
      console.log('Migration 10: deactivated all sources except hackernews + bbc for initial testing');
    }
  },
  {
    version: 11,
    description: 'Radar signals table (convergence detector output) + re-activate sources for cross-source detection',
    up: async (pool) => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS signals (
          id          SERIAL PRIMARY KEY,
          detector    VARCHAR(30) NOT NULL,
          topic       TEXT NOT NULL,
          strength    INTEGER NOT NULL DEFAULT 0,
          evidence    JSONB,
          status      VARCHAR(20) NOT NULL DEFAULT 'new',
          story_id    INTEGER REFERENCES stories(id) ON DELETE SET NULL,
          fired_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          expires_at  TIMESTAMP
        )
      `);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_signals_status ON signals(status, fired_at DESC)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_signals_topic ON signals(topic)`);
      // Radar needs multiple active sources to detect cross-source convergence —
      // re-activate the sources migration 10 turned off for initial testing.
      await pool.query(`
        UPDATE sources SET active = TRUE
        WHERE slug IN ('hackernews', 'bbc', 'guardian', 'arstechnica', 'techcrunch', 'google-trends-ca')
      `);
      console.log('Migration 11: signals table created, sources re-activated for radar');
    }
  },
  // Future migrations go here
];

async function runMigrations(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      description TEXT NOT NULL,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const result = await pool.query('SELECT MAX(version) as version FROM schema_migrations');
  const currentVersion = result.rows[0]?.version || 0;
  const pending = migrations.filter(m => m.version > currentVersion);

  if (pending.length === 0) {
    console.log(`DB schema up to date (v${currentVersion})`);
    return;
  }

  console.log(`Running ${pending.length} migration(s)…`);
  for (const migration of pending) {
    console.log(`  → v${migration.version}: ${migration.description}`);
    try {
      await migration.up(pool);
      await pool.query(
        'INSERT INTO schema_migrations (version, description) VALUES ($1, $2)',
        [migration.version, migration.description]
      );
      console.log(`  ✅ v${migration.version} done`);
    } catch (err) {
      console.error(`  ❌ v${migration.version} failed:`, err.message);
      throw err;
    }
  }
  console.log('All migrations complete');
}

module.exports = { runMigrations, migrations };
