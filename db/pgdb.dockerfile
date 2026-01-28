FROM postgres:17.2

# Copy all SQL migrations - they run in alphabetical order
COPY ./*.sql /docker-entrypoint-initdb.d/
