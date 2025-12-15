FROM postgres:16
COPY ./01-init.sql /docker-entrypoint-initdb.d/
COPY ./02-galleries.sql /docker-entrypoint-initdb.d/
COPY ./03-photo-hash.sql /docker-entrypoint-initdb.d/
