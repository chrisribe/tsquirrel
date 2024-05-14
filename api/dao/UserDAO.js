class UserDAO {
  constructor(pool) {
    this.pool = pool;
  }

  async getAllUsers() {
    const results = await this.pool.query('SELECT * FROM users');
    return results.rows;
  }

  async addUser(user) {
    const { username, password, email } = user;
    await this.pool.query('INSERT INTO users (username, password, email) VALUES ($1, $2, $3)', [username, password, email]);
  }

  async deleteUser(id) {
    await this.pool.query('DELETE FROM users WHERE id = $1', [id]);
  }

  async updateUser(user) {
    const { id, username, password, email } = user;
    await this.pool.query(
      `UPDATE users SET 
        username = $1, 
        password = $2, 
        email = $3 
      WHERE 
        id = $4`, [username, password, email, id]);
  }

}

module.exports = UserDAO;