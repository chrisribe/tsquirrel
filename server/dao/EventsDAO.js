class EventsDAO {
  constructor(pool) {
    this.pool = pool;
  }

  async getEventsByUserId(userId) {
    const result = await this.pool.query(
      'SELECT * FROM events WHERE user_id = $1 ORDER BY date DESC', [userId]);
    return result.rows;
  }

  async addEvent(userId, { title, description, date, location, category, capacity, status, organizer, tags, event_picture }) {
    if (!userId) throw new Error('User ID is required');
    
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

  async deleteEvent(userId, eventId) {
    const result = await this.pool.query(
      'DELETE FROM events WHERE user_id = $1 and id = $2 RETURNING *', [userId, eventId]);
    return result.rows[0];
  }

  async searchEvents(searchTerm) {
    const result = await this.pool.query(
      `SELECT * FROM events 
      WHERE 
        title ILIKE $1 OR description ILIKE $1 OR location ILIKE $1
      ORDER BY date DESC`,
      [`%${searchTerm}%`]
    );
    return result.rows;
  }
}

module.exports = EventsDAO;