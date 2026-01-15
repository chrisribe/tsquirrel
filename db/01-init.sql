-- Users table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(60) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  email VARCHAR(254) UNIQUE NOT NULL,
  role VARCHAR(20) DEFAULT 'user',
  status VARCHAR(20) DEFAULT 'active',
  tier VARCHAR(20) DEFAULT 'free',
  paid_at TIMESTAMP,
  expires_at TIMESTAMP
);

-- No default admin - run 'npm run create-admin' after first deploy

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
CREATE INDEX idx_users_status ON users(status);
