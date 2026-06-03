-- Add tier/payment columns to users table
-- Run: docker exec eventglimpse-db-1 psql -U dockeruser -d appdb -f /docker-entrypoint-initdb.d/06-user-tiers.sql

-- Add tier column (free, event, partypack)
ALTER TABLE users ADD COLUMN IF NOT EXISTS tier VARCHAR(20) DEFAULT 'free';

-- Add payment tracking columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP;
