const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const SecretService = require('./SecretService');

class SessionService {
  constructor(pool) {
    this.pool = pool;
    this.secretService = new SecretService(pool);
  }

  async initialize(app) {
    // Initialize secret service (ensures secrets exist, starts rotation)
    await this.secretService.initialize();
    const secrets = await this.secretService.getSecrets();
    
    app.use(session({ 
      store: new pgSession({
        pool: this.pool,
        tableName: 'user_session',
        createTableIfMissing: true,
        ttl: 7 * 24 * 60 * 60,          // 7 days
        pruneSessionInterval: 24 * 60 * 60  // Cleanup every 24h
      }),
      secret: secrets,
      resave: false,
      saveUninitialized: true,
      rolling: true,
      cookie: { 
        secure: process.env.NODE_ENV === 'production',
        maxAge: 7 * 24 * 60 * 60 * 1000,  // 7 days
        httpOnly: true,
        sameSite: 'lax'  // CSRF protection
      }
    }));
  }
}

module.exports = SessionService;
