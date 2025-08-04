FROM postgres:latest
# Copy the database initialization SQL files to initdb.d directory
COPY ./01-init.sql /docker-entrypoint-initdb.d/
COPY ./02-events.sql /docker-entrypoint-initdb.d/
COPY ./03-admin-user-management.sql /docker-entrypoint-initdb.d/