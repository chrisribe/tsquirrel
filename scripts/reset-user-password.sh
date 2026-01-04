#!/bin/bash

# Reset user password script
# Usage: ./reset-user-password.sh <email> <new-password>

set -e

EMAIL=$1
NEW_PASSWORD=$2

if [ -z "$EMAIL" ] || [ -z "$NEW_PASSWORD" ]; then
    echo "Usage: ./reset-user-password.sh <email> <new-password>"
    echo "Example: ./reset-user-password.sh user@example.com NewPass123"
    exit 1
fi

echo "Resetting password for: $EMAIL"

# Get database container name (try docker compose v2, fallback to v1)
DB_CONTAINER=$(docker compose ps -q db 2>/dev/null || docker-compose ps -q db 2>/dev/null)

if [ -z "$DB_CONTAINER" ]; then
    echo "Error: Database container not found. Is docker compose running?"
    exit 1
fi

# Hash the password using Node.js bcrypt (matching your app's logic)
HASHED_PASSWORD=$(docker exec -i $DB_CONTAINER node -e "
const bcrypt = require('bcrypt');
bcrypt.hash('$NEW_PASSWORD', 10).then(hash => console.log(hash));
" 2>/dev/null)

# Fallback if bcrypt not available in container - use direct SQL with pgcrypto
if [ -z "$HASHED_PASSWORD" ]; then
    echo "Using database to hash password..."
    HASHED_PASSWORD=$(docker exec -i $DB_CONTAINER psql -U dockeruser -d appdb -t -c "SELECT crypt('$NEW_PASSWORD', gen_salt('bf'))")
    HASHED_PASSWORD=$(echo $HASHED_PASSWORD | xargs) # trim whitespace
fi

# Update the password
docker exec -i $DB_CONTAINER psql -U dockeruser -d appdb <<EOF
UPDATE users 
SET password_hash = '$HASHED_PASSWORD'
WHERE email = '$EMAIL';
EOF

# Check if user exists
ROWS=$(docker exec -i $DB_CONTAINER psql -U dockeruser -d appdb -t -c "SELECT COUNT(*) FROM users WHERE email = '$EMAIL'")
ROWS=$(echo $ROWS | xargs)

if [ "$ROWS" -eq "0" ]; then
    echo "Error: User with email '$EMAIL' not found"
    exit 1
fi

echo "✓ Password reset successfully for: $EMAIL"
echo "New password: $NEW_PASSWORD"
