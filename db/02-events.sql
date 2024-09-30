-- Create events table
CREATE TABLE IF NOT EXISTS events (
  id SERIAL PRIMARY KEY,
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