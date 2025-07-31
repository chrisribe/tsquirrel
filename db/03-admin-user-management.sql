-- Add user status management for admin functionality
-- This adds a status field to track user account state

-- Add status column to users table with default 'active'
ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active';

-- Update existing users to have active status
UPDATE users SET status = 'active' WHERE status IS NULL;

-- Create index for faster status queries
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

-- Add comments for documentation
COMMENT ON COLUMN users.status IS 'User account status: active, paused, or deleted';