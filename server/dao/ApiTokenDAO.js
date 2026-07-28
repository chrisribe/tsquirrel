'use strict';

class ApiTokenDAO {
  constructor(pool) {
    this.pool = pool;
  }

  async listApiTokens() {
    const { rows } = await this.pool.query(`
      SELECT id, label, token_hash, created_at, revoked_at
      FROM api_tokens
      ORDER BY created_at DESC
    `);
    return rows;
  }

  async createApiToken({ label, tokenHash }) {
    const { rows } = await this.pool.query(`
      INSERT INTO api_tokens (label, token_hash)
      VALUES ($1, $2)
      RETURNING id, label, token_hash, created_at, revoked_at
    `, [label, tokenHash]);
    return rows[0] || null;
  }

  async revokeApiToken(id) {
    const { rows } = await this.pool.query(`
      UPDATE api_tokens
      SET revoked_at = COALESCE(revoked_at, NOW())
      WHERE id = $1
      RETURNING id, label, token_hash, created_at, revoked_at
    `, [id]);
    return rows[0] || null;
  }

  async getApiTokenByHash(tokenHash) {
    const { rows } = await this.pool.query(`
      SELECT id, label, token_hash, created_at, revoked_at, last_used_at
      FROM api_tokens
      WHERE token_hash = $1
      LIMIT 1
    `, [tokenHash]);
    return rows[0] || null;
  }

  async touchApiToken(id) {
    await this.pool.query(
      'UPDATE api_tokens SET last_used_at = NOW() WHERE id = $1',
      [id]
    );
  }
}

module.exports = ApiTokenDAO;
