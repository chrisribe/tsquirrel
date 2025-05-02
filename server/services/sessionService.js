// sessionService.js

const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const crypto = require('crypto');

function initialize(app, pool) {
  
  //Rotate secrets every 24 hours to enhance security
  //https://expressjs.com/en/resources/middleware/session.html

  // Array of secrets, with the most recent secret at the beginning
  let secrets = [generateSecret()];

  app.use(session({
    store: new pgSession({
      pool: pool,                // Connection pool
      tableName: 'user_session'       // Use another table-name than the default "session" one
    }),
    secret: secrets,              // Array of secrets
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }    // Set to true if your website is on HTTPS
  }));

  // Middleware attach session user to response locals
  app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    next();
  });

  // Rotate secrets every 24 hours
  setInterval(() => rotateSecrets(secrets), 24 * 60 * 60 * 1000);
}

// Function to generate a random secret
function generateSecret() {
  return crypto.randomBytes(64).toString('hex');
}

// Function to rotate secrets
function rotateSecrets(secrets) {
  secrets.unshift(generateSecret());
  // Keep only the last 5 secrets
  if (secrets.length > 5) {
    secrets.pop();
  }
}

module.exports = {
  initialize
};