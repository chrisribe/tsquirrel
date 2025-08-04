#!/bin/bash
# Usage: ./run-migration.sh <sql-file> [password]

if [ -z "$1" ]; then
    echo "Usage: $0 <sql-file> [password]"
    echo "Example: $0 db/03-admin-user-management.sql"
    echo "Example: $0 db/03-admin-user-management.sql mypassword"
    exit 1
fi

if [ ! -f "$1" ]; then
    echo "Error: File '$1' not found"
    exit 1
fi

# Get password from parameter or prompt
if [ -z "$2" ]; then
    echo -n "Database password: "
    read -s DB_PASSWORD
    echo
else
    DB_PASSWORD="$2"
fi

echo "Running migration: $1"
docker-compose exec -T -e PGPASSWORD="$DB_PASSWORD" db psql -U dockeruser -d mydb < "$1"

if [ $? -eq 0 ]; then
    echo "✓ Migration completed successfully"
else
    echo "✗ Migration failed"
    exit 1
fi