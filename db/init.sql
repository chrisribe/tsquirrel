-- This file is used to initialize the database schema and populate it with some demo data
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL
);

INSERT INTO users (name, email)
VALUES ('User1', 'user1@example.com'),
       ('User2', 'user2@example.com'),
       ('User3', 'user3@example.com'),
       ('User4', 'user4@example.com');
