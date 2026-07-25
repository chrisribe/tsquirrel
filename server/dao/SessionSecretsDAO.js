'use strict';

class SessionSecretsDAO {
  constructor(pool) {
    this.pool = pool;
  }

  async getActiveSecrets() {
    const result = await this.pool.query(
      'SELECT secret FROM session_secrets WHERE active = true ORDER BY created_at DESC'
    );
    return result.rows.map(row => row.secret);
  }

  async addSecret(secret) {
    const result = await this.pool.query(
      'INSERT INTO session_secrets (secret, active) VALUES ($1, true) RETURNING id',
      [secret]
    );
    return result.rows[0].id;
  }

  async rotateSecrets() {
    await this.pool.query(`
      UPDATE session_secrets SET active = false
      WHERE id NOT IN (
        SELECT id FROM session_secrets
        ORDER BY created_at DESC
        LIMIT 5
      )
    `);
  }

  async cleanupExpiredSecrets() {
    await this.pool.query(`
      DELETE FROM session_secrets
      WHERE active = false
        AND created_at < NOW() - INTERVAL '30 days'
    `);
  }
}

module.exports = SessionSecretsDAO;
