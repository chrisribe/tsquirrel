#!/bin/bash

# Check if the password file exists
if [ ! -f .db_password ]; then
  # Ask the user for the password
  echo "Please enter the default database password (This is a one-time setup. To change the password later, you will need to do it manually or delete the database):"
  read -s DB_PASSWORD

  # Save the password to a file
  echo "$DB_PASSWORD" > .db_password
else
  # Read the password from the file
  DB_PASSWORD=$(cat .db_password)
fi

# Export the password as an environment variable
export DB_PASSWORD

# Run docker-compose up
# Check if the first argument is 'build'
if [ "$1" == "build" ]; then
  # Use dev override if it exists (development)
  if [ -f "docker-compose.dev.yml" ]; then
    docker-compose -f docker-compose.yml -f docker-compose.dev.yml build --no-cache
  else
    docker-compose build --no-cache
  fi
fi

docker image prune -f

# Start containers with or without dev override
if [ -f "docker-compose.dev.yml" ]; then
  echo "🚀 Starting in DEVELOPMENT mode with docker-compose.dev.yml"
  docker-compose -f docker-compose.yml -f docker-compose.dev.yml up
else
  echo "🚀 Starting in PRODUCTION mode"
  docker-compose up
fi