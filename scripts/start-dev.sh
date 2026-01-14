#!/bin/bash
# Start EventGlimpse in development mode

# Change to project root (parent of scripts/)
cd "$(dirname "$0")/.."

# Always start containers first
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build

if [ "$1" = "--reset-admin" ]; then
  echo "Waiting for database..."
  sleep 5
  docker-compose exec server npm run create-admin
fi

# Attach to logs
docker-compose logs -f
