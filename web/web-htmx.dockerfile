FROM node:lts AS runtime
WORKDIR /app

COPY htmx/ .

# Install a simple HTTP server
RUN npm install -g http-server

ENV HOST=0.0.0.0
ENV PORT=80
EXPOSE 80

# Run the replacement script and then start the HTTP server
CMD ["sh", "-c", "node replace-env.js && http-server -p 80"]
