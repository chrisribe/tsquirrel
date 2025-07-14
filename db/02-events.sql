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

-- Create event_photos table
CREATE TABLE event_photos (
    id SERIAL PRIMARY KEY,
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    photo_url VARCHAR(255) NOT NULL,
    uploaded_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Insert sample photos for the cat show event
INSERT INTO event_photos (event_id, photo_url) VALUES 
(1, 'https://picsum.photos/400/300?random=1'),
(1, 'https://picsum.photos/400/300?random=2'),
(1, 'https://picsum.photos/400/300?random=3'),
(1, 'https://picsum.photos/400/300?random=4');

CREATE INDEX idx_event_photos_event_id ON event_photos(event_id);
CREATE INDEX idx_events_uuid ON events(uuid);