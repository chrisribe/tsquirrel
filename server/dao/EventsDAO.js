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

  async searchEvents(userId, searchTerm) {
    const result = await this.pool.query(
      `SELECT * FROM events 
      WHERE 
        user_id = $1 AND (
          title ILIKE $2 OR description ILIKE $2 OR location ILIKE $2 OR tags ILIKE $2
        )
      ORDER BY date DESC`,
      [userId, `%${searchTerm}%`]
    );
    return result.rows;
  }

  async getEventById(eventId) {
    const client = await this.pool.connect();
    try {
      const result = await client.query('SELECT * FROM events WHERE id = $1', [eventId]);
      return result.rows[0]; // Returns the event object or undefined if not found
    } finally {
      client.release();
    }
  }

  async getEventByUuid(eventUuid) {
    const result = await this.pool.query('SELECT * FROM events WHERE uuid = $1', [eventUuid]);
    return result.rows[0];
  }

  async getPhotosByEventId(eventId) {
    const client = await this.pool.connect();
    try {
      const result = await client.query('SELECT id, event_id, photo_url, uploaded_at FROM event_photos WHERE event_id = $1 ORDER BY uploaded_at DESC', [eventId]);
      return result.rows; // Returns an array of photo objects
    } finally {
      client.release();
    }
  }



  async addPhotoToEvent(eventId, photoUrl) {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        'INSERT INTO event_photos (event_id, photo_url) VALUES ($1, $2) RETURNING *',
        [eventId, photoUrl]
      );
      return result.rows[0];
    } finally {
      client.release();
    }
  }

  async addPhotoToEventByUuid(eventUuid, photoUrl) {
    const client = await this.pool.connect();
    try {
      // First get the event ID from UUID
      const eventResult = await client.query('SELECT id FROM events WHERE uuid = $1', [eventUuid]);
      if (!eventResult.rows[0]) throw new Error('Event not found');
      
      const eventId = eventResult.rows[0].id;
      const result = await client.query(
        'INSERT INTO event_photos (event_id, photo_url) VALUES ($1, $2) RETURNING *',
        [eventId, photoUrl]
      );
      return result.rows[0];
    } finally {
      client.release();
    }
  }

  async addPhoto(photoData) {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `INSERT INTO event_photos (event_uuid, photo_id, original_name, s3_key, width, height, uploaded_at) 
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [photoData.event_uuid, photoData.photo_id, photoData.original_name, photoData.s3_key, photoData.width, photoData.height, photoData.uploaded_at]
      );
      return result.rows[0];
    } finally {
      client.release();
    }
  }

  async deletePhoto(eventUuid, photoId) {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        'DELETE FROM event_photos WHERE event_uuid = $1 AND photo_id = $2 RETURNING *',
        [eventUuid, photoId]
      );
      return result.rows[0];
    } finally {
      client.release();
    }
  }

  async getPhotosByEventUuid(eventUuid) {
    const client = await this.pool.connect();
    try {
      const result = await client.query(`
        SELECT 
          photo_id, 
          original_name, 
          s3_key, 
          photo_url,
          width,
          height,
          uploaded_at 
        FROM event_photos 
        WHERE event_uuid = $1 
        ORDER BY uploaded_at DESC
      `, [eventUuid]);
      return result.rows;
    } finally {
      client.release();
    }
  }

}

module.exports = EventsDAO;