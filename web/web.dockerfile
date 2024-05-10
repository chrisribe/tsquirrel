# Use an official Node.js runtime as the base image
FROM node:20.13.1

# Set the working directory in the Docker container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json into the working directory
COPY astro/package*.json ./

# Install the dependencies in the Docker container
RUN npm install

# Copy the rest of the code into the working directory
COPY astro/ .

# Build the Astro project
RUN npm run build

# Use Nginx to serve the static files
FROM nginx:1.21.1-alpine

# Copy the built files from the build stage into the Nginx container
COPY --from=0 /usr/src/app/dist /usr/share/nginx/html

# Expose port 80 for the Nginx server
EXPOSE 80

# Start Nginx
CMD ["nginx", "-g", "daemon off;"]