'use strict';

class UserDAO {
  constructor(pool) {
    this.pool = pool;
  }

  async getUserByUsername(username) {
    const r = await this.pool.query('SELECT * FROM users WHERE username = $1', [username]);
    return r.rows[0];
  }

  async getUserByEmail(email) {
    const r = await this.pool.query('SELECT * FROM users WHERE email = $1', [email]);
    return r.rows[0];
  }

  async getUserById(id) {
    const r = await this.pool.query('SELECT * FROM users WHERE id = $1', [id]);
    return r.rows[0];
  }

  async addUser({ username, password, email, role = 'user' }) {
    const r = await this.pool.query(
      'INSERT INTO users (username, password, email, role) VALUES ($1, $2, $3, $4) RETURNING id',
      [username, password, email, role]
    );
    return r.rows[0].id;
  }

  // Used by scripts/create-user.js — create if new, update password/role if username exists
  async upsertAdmin({ username, email, password, role }) {
    const existing = await this.getUserByUsername(username);
    if (existing) {
      await this.pool.query(
        'UPDATE users SET password = $1, email = $2, role = $3 WHERE id = $4',
        [password, email, role, existing.id]
      );
      return { id: existing.id, inserted: false };
    }
    const id = await this.addUser({ username, password, email, role });
    return { id, inserted: true };
  }
}

module.exports = UserDAO;
