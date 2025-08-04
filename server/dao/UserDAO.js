class UserDAO {
  constructor(pool) {
    this.pool = pool;
  }

  async getAllUsers() {
    const r = await this.pool.query('SELECT * FROM users');
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
    try {
      const result = await this.pool.query(
        'INSERT INTO users (username, password, email) VALUES ($1, $2, $3) RETURNING id',
        [username, password, email]
      );
      const userId = result.rows[0].id;
      return userId;
    } catch (error) {
      throw new Error('Error adding user');
    }
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

  // Admin-specific methods for user management

  // Helper method to build asset count query with optional user filter
  _buildAssetCountQuery(userId = null) {
    const whereClause = userId ? 'WHERE u.id = $1' : '';
    
    return `
      SELECT 
        u.id,
        u.username,
        u.email,
        u.role,
        u.status,
        COALESCE(event_counts.total_events, 0) as total_events,
        COALESCE(photo_counts.total_photos, 0) as total_photos
      FROM users u
      LEFT JOIN (
        SELECT user_id, COUNT(*) as total_events
        FROM events 
        GROUP BY user_id
      ) event_counts ON u.id = event_counts.user_id
      LEFT JOIN (
        SELECT e.user_id, COUNT(ep.*) as total_photos
        FROM events e
        LEFT JOIN event_photos ep ON (e.id = ep.event_id OR e.uuid = ep.event_uuid)
        GROUP BY e.user_id
      ) photo_counts ON u.id = photo_counts.user_id
      ${whereClause}
      ORDER BY u.id`;
  }

  async getUsersWithAssetCounts() {
    const query = this._buildAssetCountQuery();
    const result = await this.pool.query(query);
    return result.rows;
  }

  async updateUserStatus(userId, status) {
    const validStatuses = ['active', 'paused', 'deleted'];
    if (!validStatuses.includes(status)) {
      throw new Error('Invalid user status');
    }
    
    // Update status and return updated user with asset counts
    await this.pool.query(
      'UPDATE users SET status = $1 WHERE id = $2',
      [status, userId]
    );

    // Return the updated user with asset counts
    const query = this._buildAssetCountQuery(userId);
    const result = await this.pool.query(query, [userId]);
    return result.rows[0];
  }

  async getUserAssetCounts(userId) {
    const query = this._buildAssetCountQuery(userId);
    const result = await this.pool.query(query, [userId]);
    
    if (result.rows.length === 0) {
      return { total_events: 0, total_photos: 0 };
    }
    
    const { total_events, total_photos } = result.rows[0];
    return { total_events, total_photos };
  }

}

module.exports = UserDAO;