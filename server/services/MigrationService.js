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
