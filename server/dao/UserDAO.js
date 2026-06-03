class UserDAO {
  constructor(pool) {
    this.pool = pool;
  }

  async getAllUsers() {
    const r = await this.pool.query('SELECT id, username, email, role, status FROM users');
    return r.rows;
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
    const results = await this.pool.query('SELECT * FROM users WHERE id = $1', [id]);
    return results.rows[0];
  }

  async addUser(user) {
    const { username, password, email } = user;
    const result = await this.pool.query(
      'INSERT INTO users (username, password, email) VALUES ($1, $2, $3) RETURNING id',
      [username, password, email]
    );
    return result.rows[0].id;
  }

  async deleteUser(id) {
    await this.pool.query('DELETE FROM users WHERE id = $1', [id]);
  }

  async updateUser(user) {
    const { id, username, password, email } = user;
    await this.pool.query(
      'UPDATE users SET username = $1, password = $2, email = $3 WHERE id = $4',
      [username, password, email, id]
    );
  }

  async updateUserStatus(userId, status) {
    const validStatuses = ['active', 'paused', 'deleted'];
    if (!validStatuses.includes(status)) {
      throw new Error('Invalid user status');
    }
    
    await this.pool.query('UPDATE users SET status = $1 WHERE id = $2', [status, userId]);
    
    const result = await this.pool.query(
      'SELECT id, username, email, role, status, tier, paid_at FROM users WHERE id = $1',
      [userId]
    );
    return result.rows[0];
  }

  async updateUserTier(userId, tier) {
    const validTiers = ['free', 'event', 'partypack'];
    if (!validTiers.includes(tier)) {
      throw new Error('Invalid tier. Must be one of: ' + validTiers.join(', '));
    }
    
    const paidAt = tier !== 'free' ? 'NOW()' : 'NULL';
    await this.pool.query(
      `UPDATE users SET tier = $1, paid_at = ${paidAt} WHERE id = $2`,
      [tier, userId]
    );
    
    const result = await this.pool.query(
      'SELECT id, username, email, role, status, tier, paid_at FROM users WHERE id = $1',
      [userId]
    );
    return result.rows[0];
  }

  async getUsersWithStats() {
    const result = await this.pool.query(`
      SELECT u.id, u.username, u.email, u.role, u.status, u.tier, u.paid_at,
             COUNT(DISTINCT g.id) as gallery_count,
             COUNT(p.id) as photo_count
      FROM users u
      LEFT JOIN galleries g ON g.user_id = u.id
      LEFT JOIN photos p ON p.gallery_uuid = g.uuid
      GROUP BY u.id
      ORDER BY u.id
    `);
    return result.rows;
  }

  async getUserGalleriesForAdmin(userId) {
    const result = await this.pool.query(`
      SELECT g.id, g.uuid, g.title, g.created_at,
             COUNT(p.id) as photo_count
      FROM galleries g
      LEFT JOIN photos p ON p.gallery_uuid = g.uuid
      WHERE g.user_id = $1
      GROUP BY g.id
      ORDER BY g.created_at DESC
    `, [userId]);
    return result.rows;
  }
}

module.exports = UserDAO;
