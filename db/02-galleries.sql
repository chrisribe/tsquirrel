-- Galleries table
-- ⚠️ SYNC: When changing schema, also update /server/services/MigrationService.js
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS galleries (
    id SERIAL PRIMARY KEY,
    uuid UUID DEFAULT uuid_generate_v4() UNIQUE NOT NULL,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    tier VARCHAR(20) DEFAULT 'free',
    expires_at TIMESTAMP,
    paid_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Photos table
CREATE TABLE IF NOT EXISTS photos (
    id SERIAL PRIMARY KEY,
    gallery_uuid UUID NOT NULL REFERENCES galleries(uuid) ON DELETE CASCADE,
    photo_id UUID DEFAULT uuid_generate_v4() UNIQUE NOT NULL,
    s3_key VARCHAR(512) NOT NULL,
    width INTEGER DEFAULT 400,
    height INTEGER DEFAULT 300,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_galleries_uuid ON galleries(uuid);
CREATE INDEX IF NOT EXISTS idx_galleries_user_id ON galleries(user_id);
CREATE INDEX IF NOT EXISTS idx_galleries_tier ON galleries(tier);
CREATE INDEX IF NOT EXISTS idx_photos_gallery_uuid ON photos(gallery_uuid);
CREATE INDEX IF NOT EXISTS idx_photos_photo_id ON photos(photo_id);
