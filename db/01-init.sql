-- Session table for connect-pg-simple
CREATE TABLE "user_session" (
  "sid" varchar NOT NULL COLLATE "default",
  "sess" json NOT NULL,
  "expire" timestamp(6) NOT NULL
)
WITH (OIDS=FALSE);

ALTER TABLE "user_session" ADD CONSTRAINT "user_session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE;
CREATE INDEX "IDX_session_expire" ON "user_session" ("expire");

-- Session secrets table for rotating session encryption
CREATE TABLE IF NOT EXISTS session_secrets (
  id SERIAL PRIMARY KEY,
  secret VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  active BOOLEAN DEFAULT TRUE
);

CREATE INDEX idx_session_secrets_active ON session_secrets(active);

-- News sources
CREATE TABLE IF NOT EXISTS sources (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  url VARCHAR(500) NOT NULL,
  feed_url VARCHAR(500),          -- RSS/Atom URL
  type VARCHAR(20) DEFAULT 'rss', -- rss | hn | reddit
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Articles (raw ingested items)
CREATE TABLE IF NOT EXISTS articles (
  id SERIAL PRIMARY KEY,
  source_id INTEGER REFERENCES sources(id),
  external_id VARCHAR(255),       -- guid/url hash for dedup
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  published_at TIMESTAMP,
  fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(source_id, external_id)
);

CREATE INDEX idx_articles_published ON articles(published_at DESC);
CREATE INDEX idx_articles_source ON articles(source_id);

-- Stories (grouped articles + AI summary)
CREATE TABLE IF NOT EXISTS stories (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  slug VARCHAR(255) UNIQUE NOT NULL,
  summary TEXT,                   -- AI-generated synthesis
  category VARCHAR(50),           -- AI-categorized
  tags TEXT[],                    -- AI-extracted entities/tags
  sentiment NUMERIC(3,2),         -- -1.0 to 1.0
  heat_score INTEGER DEFAULT 0,   -- source count * recency weighting
  image_url TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_featured BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_stories_created ON stories(created_at DESC);
CREATE INDEX idx_stories_category ON stories(category);
CREATE INDEX idx_stories_heat ON stories(heat_score DESC);

-- Link articles to stories (many-to-many)
CREATE TABLE IF NOT EXISTS story_articles (
  story_id INTEGER REFERENCES stories(id) ON DELETE CASCADE,
  article_id INTEGER REFERENCES articles(id) ON DELETE CASCADE,
  PRIMARY KEY (story_id, article_id)
);
