-- Add QR code URL column to galleries table
ALTER TABLE galleries ADD COLUMN IF NOT EXISTS qr_code_url VARCHAR(512);
