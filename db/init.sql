-- Create a new database table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(60) UNIQUE NOT NULL,
  password VARCHAR(60) NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL
);
-- Insert initial data into the table
INSERT INTO users (username, email, password)
VALUES ('admin', 'admin@example.com', 'admin1234');
