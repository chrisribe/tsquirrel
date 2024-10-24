class EventsDAO {
  constructor(pool) {
    this.pool = pool;
  }

  async getEventsByUserId(userId) {
    const result = await this.pool.query('SELECT * FROM events WHERE user_id = $1 ORDER BY date ASC', [userId]);
    return result.rows;
  }

  async addEvent(userId, { title, description, date, location, category, capacity, status, organizer, tags, event_picture }) {
    const result = await this.pool.query(
      `INSERT INTO events (
        user_id, title, description, date, location, 
        category, capacity, status, organizer,
        tags, event_picture
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [userId, title, description, date, location, category, capacity, status, organizer, tags, event_picture]
    );
    return result.rows[0].id;
  }
}

module.exports = EventsDAO;