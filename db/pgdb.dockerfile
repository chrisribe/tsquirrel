FROM postgres:latest
# Copy the database initialization SQL file
COPY ./init.sql /docker-entrypoint-initdb.d/