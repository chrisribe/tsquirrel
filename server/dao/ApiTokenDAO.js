'use strict';

class ApiTokenDAO {
  constructor(pool) {
    this.pool = pool;
  }

  async listApiTokens() {
    const { rows } = await this.pool.query(`
      SELECT id, label, token_hash, plan, monthly_quota, created_at, revoked_at, last_used_at
      FROM api_tokens
      ORDER BY created_at DESC
    `);
    return rows;
  }

  async createApiToken({ label, tokenHash, plan = 'internal', monthlyQuota = null }) {
    const { rows } = await this.pool.query(`
      INSERT INTO api_tokens (label, token_hash, plan, monthly_quota)
      VALUES ($1, $2, $3, $4)
      RETURNING id, label, token_hash, plan, monthly_quota, created_at, revoked_at, last_used_at
    `, [label, tokenHash, plan, monthlyQuota]);
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
      SELECT id, label, token_hash, plan, monthly_quota, is_active, created_at, revoked_at, last_used_at
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

  async addUsage(tokenId, day = null) {
    const params = [tokenId];
    const dayExpr = day ? '$2::date' : 'CURRENT_DATE';
    if (day) params.push(day);
    const { rows } = await this.pool.query(`
      INSERT INTO api_token_usage_daily (token_id, day, request_count)
      VALUES ($1, ${dayExpr}, 1)
      ON CONFLICT (token_id, day)
      DO UPDATE SET request_count = api_token_usage_daily.request_count + 1
      RETURNING request_count
    `, params);
    return rows[0]?.request_count || 0;
  }

  async getMonthlyUsage(tokenId) {
    const { rows } = await this.pool.query(`
      SELECT COALESCE(SUM(request_count), 0)::int AS used
      FROM api_token_usage_daily
      WHERE token_id = $1
        AND day >= date_trunc('month', CURRENT_DATE)::date
    `, [tokenId]);
    return rows[0]?.used || 0;
  }
}

module.exports = ApiTokenDAO;
