const crypto = require('crypto');
const SessionSecretsDAO = require('../dao/SessionSecretsDAO');

class SecretService {
  constructor(pool) {
    this.secretsDAO = new SessionSecretsDAO(pool);
    this.rotationTimer = null;
    this.initialize();
  }

  async initialize() {
    await this.getSecrets();
    await this.startRotation();
  }

  async getSecrets() {
    let secrets = await this.secretsDAO.getActiveSecrets();
    
    // Create initial secret if none exist
    if (secrets.length === 0) {
      const newSecret = this.generateSecret();
      await this.secretsDAO.addSecret(newSecret);
      secrets = [newSecret];
    }
    
    return secrets;
  }

  async rotateSecrets() {
    const newSecret = this.generateSecret();
    await this.secretsDAO.addSecret(newSecret);
    await this.secretsDAO.rotateSecrets();
    return await this.secretsDAO.getActiveSecrets();
  }

  generateSecret() {
    return crypto.randomBytes(64).toString('hex');
  }

  //Rotate secrets every 24 hours to enhance security
  //https://expressjs.com/en/resources/middleware/session.html
  async startRotation(intervalMs = 24 * 60 * 60 * 1000) {
    // Clear existing timer if any
    if (this.rotationTimer) clearInterval(this.rotationTimer);
    
    // Schedule rotation
    this.rotationTimer = setInterval(async () => {
      await this.rotateSecrets();
      await this.secretsDAO.cleanupExpiredSecrets();
    }, intervalMs);
  }
}

module.exports = SecretService;