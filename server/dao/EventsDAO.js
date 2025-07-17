class EventsDAO {
  constructor(pool) {
    this.pool = pool;
  }

  async getEventsByUserId(userId) {
    const result = await this.pool.query(
      'SELECT * FROM events WHERE user_id = $1 ORDER BY date DESC', [userId]);
    return result.rows;
  }

  async getUpcomingEventsByUserId(userId) {
    const result = await this.pool.query(
      'SELECT * FROM events WHERE user_id = $1 AND date > CURRENT_TIMESTAMP ORDER BY date ASC', 
      [userId]
    );
    return result.rows;
  }

  async getPastEventsByUserId(userId) {
    const result = await this.pool.query(
      'SELECT * FROM events WHERE user_id = $1 AND date <= CURRENT_TIMESTAMP ORDER BY date DESC', 
      [userId]
    );
    return result.rows;
  }

  async getEventCountsByUserId(userId) {
    const result = await this.pool.query(
      `SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN date > CURRENT_TIMESTAMP THEN 1 END) as upcoming,
        COUNT(CASE WHEN date <= CURRENT_TIMESTAMP THEN 1 END) as past
       FROM events WHERE user_id = $1`, 
      [userId]
    );
    return result.rows[0];
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
    return result.rows[0];
  }

  async updateEvent(eventId, { title, description, date, location, category, capacity, status, organizer, tags, event_picture }) {
    const result = await this.pool.query(
      `UPDATE events SET 
        title = $2, description = $3, date = $4, location = $5, 
        category = $6, capacity = $7, status = $8, organizer = $9,
        tags = $10, event_picture = $11
       WHERE id = $1 RETURNING *`,
      [eventId, title, description, date, location, category, capacity, status, organizer, tags, event_picture]
    );
    return result.rows[0];
  }

  async getEventWithFirstPhoto(eventId) {
    const result = await this.pool.query(
      `SELECT e.*, 
              (SELECT photo_url FROM event_photos 
               WHERE event_id = e.id 
               ORDER BY uploaded_at ASC LIMIT 1) as first_photo_url
       FROM events e WHERE e.id = $1`,
      [eventId]
    );
    return result.rows[0];
  }

  async getEventsWithFirstPhotos(userId) {
    const result = await this.pool.query(
      `SELECT e.*, 
              (SELECT photo_url FROM event_photos 
               WHERE event_id = e.id 
               ORDER BY uploaded_at ASC LIMIT 1) as first_photo_url
       FROM events e 
       WHERE e.user_id = $1 
       ORDER BY e.date DESC`,
      [userId]
    );
    return result.rows;
  }

  async getUpcomingEventsWithFirstPhotos(userId) {
    const result = await this.pool.query(
      `SELECT e.*, 
              (SELECT photo_url FROM event_photos 
               WHERE event_id = e.id 
               ORDER BY uploaded_at ASC LIMIT 1) as first_photo_url
       FROM events e 
       WHERE e.user_id = $1 AND e.date > CURRENT_TIMESTAMP 
       ORDER BY e.date ASC`,
      [userId]
    );
    return result.rows;
  }

  async getPastEventsWithFirstPhotos(userId) {
    const result = await this.pool.query(
      `SELECT e.*, 
              (SELECT photo_url FROM event_photos 
               WHERE event_id = e.id 
               ORDER BY uploaded_at ASC LIMIT 1) as first_photo_url
       FROM events e 
       WHERE e.user_id = $1 AND e.date <= CURRENT_TIMESTAMP 
       ORDER BY e.date DESC`,
      [userId]
    );
    return result.rows;
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
        title ILIKE $1 OR 
        description ILIKE $1 OR 
        location ILIKE $1 OR 
        tags ILIKE $1 OR 
        category ILIKE $1
      ORDER BY date DESC`,
      [`%${searchTerm}%`]
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

  async getPhotosByEventUuid(eventUuid) {
    const client = await this.pool.connect();
    try {
      const result = await client.query(`
        SELECT ep.id, ep.event_id, ep.photo_url, ep.uploaded_at 
        FROM event_photos ep 
        JOIN events e ON ep.event_id = e.id 
        WHERE e.uuid = $1 
        ORDER BY ep.uploaded_at DESC
      `, [eventUuid]);
      return result.rows;
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