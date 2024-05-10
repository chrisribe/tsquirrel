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
  docker-compose up --build
else
  docker-compose up
fi