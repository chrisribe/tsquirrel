#!/bin/bash

# Migration runner script for production
# Usage: ./run-migration.sh <migration-file>

set -e

MIGRATION_FILE=$1

if [ -z "$MIGRATION_FILE" ]; then
    echo "Usage: ./run-migration.sh <migration-file>"
    echo "Example: ./run-migration.sh db/04-qr-codes.sql"
    exit 1
fi

if [ ! -f "$MIGRATION_FILE" ]; then
    echo "Error: Migration file not found: $MIGRATION_FILE"
    exit 1
fi

echo "Running migration: $MIGRATION_FILE"

# Get database container name (try docker compose v2, fallback to v1)
DB_CONTAINER=$(docker compose ps -q db 2>/dev/null || docker-compose ps -q db 2>/dev/null)

if [ -z "$DB_CONTAINER" ]; then
    echo "Error: Database container not found. Is docker compose running?"
    exit 1
fi

# Run the migration
docker exec -i $DB_CONTAINER psql -U dockeruser -d appdb < "$MIGRATION_FILE"

echo "Migration completed successfully!"
