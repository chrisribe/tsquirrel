'use strict';

const crypto = require('crypto');
const SessionSecretsDAO = require('../dao/SessionSecretsDAO');

class SecretService {
  constructor(pool) {
    this.secretsDAO = new SessionSecretsDAO(pool);
    this.rotationTimer = null;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    await this.getSecrets();
    this.startRotation();
    this.initialized = true;
  }

  async getSecrets() {
    let secrets = await this.secretsDAO.getActiveSecrets();

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

  // Rotate secrets every 24 hours for enhanced security
  startRotation(intervalMs = 24 * 60 * 60 * 1000) {
    if (this.rotationTimer) clearInterval(this.rotationTimer);

    this.rotationTimer = setInterval(async () => {
      await this.rotateSecrets();
      await this.secretsDAO.cleanupExpiredSecrets();
    }, intervalMs);
  }
}

module.exports = SecretService;
