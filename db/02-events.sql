-- Create events table
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS events (
  id SERIAL PRIMARY KEY,
  uuid UUID DEFAULT uuid_generate_v4() UNIQUE NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  date TIMESTAMP NOT NULL,
  location VARCHAR(255),
  category VARCHAR(100),
  capacity INTEGER,
  status VARCHAR(50) DEFAULT 'upcoming',
  organizer VARCHAR(255),
  tags VARCHAR(255),
  event_picture VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert initial data into the events table
INSERT INTO events (
  title, description, date, location, user_id, event_picture)
VALUES (
  'Funny Cat Show', 
  'Join us for a hilarious evening of cat antics and comedy. Bring your sense of humor and prepare to laugh!',
  '2023-12-31 23:59:59',
  'Comedy Club',
  1,
  'https://picsum.photos/200'
);

-- Create event_photos table with S3 support
CREATE TABLE event_photos (
    id SERIAL PRIMARY KEY,
    event_id INTEGER REFERENCES events(id) ON DELETE CASCADE, -- Keep for backward compatibility
    event_uuid UUID REFERENCES events(uuid) ON DELETE CASCADE, -- New S3-based reference
    photo_id UUID DEFAULT uuid_generate_v4() UNIQUE NOT NULL, -- Unique photo identifier
    original_name VARCHAR(255), -- Original filename from upload
    s3_key VARCHAR(512), -- Full S3 path (uploads/event-uuid/photo-id.ext)
    photo_url VARCHAR(255), -- Deprecated but kept for backward compatibility
    width INTEGER DEFAULT 400, -- Image width for flexImages layout
    height INTEGER DEFAULT 300, -- Image height for flexImages layout
    uploaded_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Sample photos removed - use EventGlimpse app to upload real photos to S3
-- Photos will be stored with s3_key format: uploads/event-uuid/photo-id.ext

CREATE INDEX idx_event_photos_event_id ON event_photos(event_id);
CREATE INDEX idx_event_photos_event_uuid ON event_photos(event_uuid);
CREATE INDEX idx_event_photos_photo_id ON event_photos(photo_id);
CREATE INDEX idx_events_uuid ON events(uuid);