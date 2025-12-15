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
      'SELECT id, username, email, role, status FROM users WHERE id = $1',
      [userId]
    );
    return result.rows[0];
  }

  async getUsersWithStats() {
    const result = await this.pool.query(`
      SELECT id, username, email, role, status
      FROM users 
      ORDER BY id
    `);
    return result.rows;
  }
}

module.exports = UserDAO;
