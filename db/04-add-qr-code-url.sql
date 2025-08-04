-- Add qr_code_url column to events table for QR code support
-- This migration is safe to run multiple times

ALTER TABLE events ADD COLUMN IF NOT EXISTS qr_code_url VARCHAR(512);

COMMENT ON COLUMN events.qr_code_url IS 'Stores QR code image URL for event gallery sharing';
