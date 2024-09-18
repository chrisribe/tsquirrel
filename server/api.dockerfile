FROM node:14
WORKDIR /app
COPY . .

COPY ../web/static /app/web/static

RUN npm install

CMD [ "npm", "start" ]