-- Create a new database table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(60) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  email VARCHAR(254) UNIQUE NOT NULL,
  role VARCHAR(20) DEFAULT 'user'
);
-- Insert initial data into the table
INSERT INTO users (username, email, password, role)
-- pwd is: admin1234
VALUES (
  'admin', 
  'admin@example.com', 
  '$argon2id$v=19$m=65536,t=3,p=4$0saH+hyFdLdJ9Z5N52a9iQ$UietWEniIHm+yBCS89PT6O53oJGQ3PQpWm1WPhbgvek',
  'admin'
);

-- insert a test user
INSERT INTO users (username, email, password, role)
VALUES(
  'testuser',
  'testuser@gmail.com',
  '$argon2id$v=19$m=65536,t=3,p=4$0saH+hyFdLdJ9Z5N52a9iQ$UietWEniIHm+yBCS89PT6O53oJGQ3PQpWm1WPhbgvek',
  'user'
);

-- Create session table for connect-pg-simple
CREATE TABLE "user_session" (
  "sid" varchar NOT NULL COLLATE "default",
  "sess" json NOT NULL,
  "expire" timestamp(6) NOT NULL
)
WITH (OIDS=FALSE);

ALTER TABLE "user_session" ADD CONSTRAINT "user_session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE;
CREATE INDEX "IDX_session_expire" ON "user_session" ("expire");

-- Create a table to store session secrets
CREATE TABLE IF NOT EXISTS session_secrets (
  id SERIAL PRIMARY KEY,
  secret VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  active BOOLEAN DEFAULT TRUE
);
-- Add index on active flag for faster lookups
CREATE INDEX idx_session_secrets_active ON session_secrets(active);
COMMENT ON TABLE session_secrets IS 'Stores session encryption secrets for persistent authentication';