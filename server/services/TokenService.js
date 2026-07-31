'use strict';

const crypto = require('crypto');
const ApiTokenDAO = require('../dao/ApiTokenDAO');

class TokenService {
  constructor(pool) {
    this.dao = new ApiTokenDAO(pool);
  }

  async getTokensModel() {
    const tokens = await this.dao.listApiTokens();
    return { tokens };
  }

  async createToken(rawLabel) {
    const label = String(rawLabel || '').trim().slice(0, 100);
    if (!label) {
      const error = new Error('Label is required.');
      error.status = 400;
      throw error;
    }

    const token = `tsq_${crypto.randomBytes(24).toString('base64url')}`;
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    await this.dao.createApiToken({ label, tokenHash });
    return token;
  }

  async revokeToken(id) {
    const tokenId = parseInt(id, 10);
    if (!tokenId) return null;
    return this.dao.revokeApiToken(tokenId);
  }
}

module.exports = TokenService;
