-- Add taken_at column for EXIF date sorting
-- Photos will be sorted by taken_at (when photo was captured) with fallback to uploaded_at

ALTER TABLE photos ADD COLUMN taken_at TIMESTAMP;

-- Index for efficient sorting
CREATE INDEX idx_photos_taken_at ON photos(gallery_uuid, taken_at DESC NULLS LAST, uploaded_at DESC);
