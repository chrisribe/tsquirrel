FROM node:14
WORKDIR /app
COPY ./package.json ./
COPY ./*.js ./
RUN npm install
CMD [ "npm", "start" ]