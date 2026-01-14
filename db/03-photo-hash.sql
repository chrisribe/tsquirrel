-- Add file hash for duplicate detection
ALTER TABLE photos ADD COLUMN IF NOT EXISTS file_hash VARCHAR(64);

-- Index for fast duplicate lookups within a gallery
CREATE INDEX IF NOT EXISTS idx_photos_gallery_hash ON photos(gallery_uuid, file_hash);
