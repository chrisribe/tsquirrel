const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const SecretService = require('./SecretService');
const crypto = require('crypto');

class SessionService {
  constructor(pool) {
    this.pool = pool;
    this.secretService = new SecretService(pool);
  }

  async initialize(app) {
    // Get secrets for session encryption
    const secrets = await this.secretService.getSecrets();
    
    app.use(session({ 
      store: new pgSession({
        pool: this.pool,
        tableName: 'user_session',
        createTableIfMissing: true,
        ttl: 7 * 24 * 60 * 60,
        pruneSessionInterval: 24 * 60 * 60
      }),
      secret: secrets,
      resave: false,
      saveUninitialized: true,
      rolling: true,
      cookie: { 
        secure: false,
        maxAge: 7 * 24 * 60 * 60 * 1000,
        httpOnly: true
      }
    }));

  }
  
}

module.exports = SessionService;