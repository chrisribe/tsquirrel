/**
 * EventsDAO - Data Access Object for event and photo management
 * 
 * @typedef {Object} EventData
 * @property {string} title - Event title (required)
 * @property {string} [description] - Event description
 * @property {Date|string} date - Event date (required)
 * @property {string} location - Event location (required)
 * @property {string} [category] - Event category
 * @property {number} [capacity] - Maximum attendees
 * @property {string} [status='active'] - Event status
 * @property {string} [organizer] - Organizer name
 * @property {string} [tags] - Comma-separated tags
 * @property {string} [event_picture] - Picture URL
 * 
 * @typedef {Object} PhotoData
 * @property {string} event_uuid - Event UUID (required)
 * @property {string} photo_id - Unique photo ID (required)
 * @property {string} original_name - Original filename (required)
 * @property {string} s3_key - S3 storage key (required)
 * @property {number} [width] - Image width in pixels
 * @property {number} [height] - Image height in pixels
 * @property {Date|string} [uploaded_at] - Upload timestamp (defaults to now)
 */
class EventsDAO {
  constructor(pool) {
    this.pool = pool;
  }

  // ============================================
  // CORE QUERY METHOD
  // ============================================

  /**
   * Execute query with consistent error handling
   */
  async query(sql, params = []) {
    try {
      const result = await this.pool.query(sql, params);
      return result.rows;
    } catch (error) {
      console.error('Database query error:', error);
      throw error;
    }
  }

  // ============================================
  // SIMPLIFIED EVENT METHODS
  // ============================================

  /**
   * Get events with flexible filtering
   * @param {Object} filters - Filter options
   * @param {number} filters.userId - User ID (required)
   * @param {string} filters.timeFilter - 'upcoming', 'past', or null for all
   * @param {string} filters.searchTerm - Search term for title/description/location
   * @param {boolean} filters.includePhotos - Include first photo URL
   * @param {string} filters.orderBy - Order by field (default: 'date')
   * @param {string} filters.orderDir - 'ASC' or 'DESC' (default: 'DESC')
   */
  async getEvents(filters = {}) {
    const { 
      userId, 
      timeFilter, 
      searchTerm, 
      includePhotos = false,
      orderBy = 'date',
      orderDir = 'DESC'
    } = filters;

    if (!userId) throw new Error('User ID is required');

    // Build query parts
    let query = includePhotos 
      ? `SELECT e.*, 
         (SELECT photo_url FROM event_photos 
          WHERE event_id = e.id 
          ORDER BY uploaded_at ASC LIMIT 1) as first_photo_url
         FROM events e`
      : 'SELECT * FROM events e';

    let conditions = ['e.user_id = $1'];
    let params = [userId];
    let paramCount = 1;

    // Add time filter
    if (timeFilter === 'upcoming') {
      conditions.push('e.date > CURRENT_TIMESTAMP');
    } else if (timeFilter === 'past') {
      conditions.push('e.date <= CURRENT_TIMESTAMP');
    }

    // Add search filter
    if (searchTerm?.trim()) {
      paramCount++;
      conditions.push(`(
        e.title ILIKE $${paramCount} OR 
        e.description ILIKE $${paramCount} OR 
        e.location ILIKE $${paramCount} OR 
        e.tags ILIKE $${paramCount} OR 
        e.category ILIKE $${paramCount}
      )`);
      params.push(`%${searchTerm}%`);
    }

    // Combine conditions
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    // Add ordering
    const validOrderFields = ['date', 'title', 'created_at'];
    const orderField = validOrderFields.includes(orderBy) ? orderBy : 'date';
    const direction = orderDir === 'ASC' ? 'ASC' : 'DESC';
    query += ` ORDER BY e.${orderField} ${direction}`;

    return this.query(query, params);
  }

  /**
   * Get event counts for a user
   */
  async getEventCounts(userId) {
    const query = `
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN date > CURRENT_TIMESTAMP THEN 1 END) as upcoming,
        COUNT(CASE WHEN date <= CURRENT_TIMESTAMP THEN 1 END) as past
      FROM events WHERE user_id = $1`;
    
    const rows = await this.query(query, [userId]);
    return rows[0];
  }

  /**
   * Get single event by ID or UUID
   */
  async getEvent(identifier, byUuid = false) {
    const field = byUuid ? 'uuid' : 'id';
    const query = `SELECT * FROM events WHERE ${field} = $1`;
    const rows = await this.query(query, [identifier]);
    return rows[0];
  }

  /**
   * Get single event with first photo by event ID
   */
  async getEventWithFirstPhoto(eventId) {
    const query = `
      SELECT e.*, 
             (SELECT photo_url FROM event_photos 
              WHERE event_id = e.id 
              ORDER BY uploaded_at ASC LIMIT 1) as first_photo_url
      FROM events e 
      WHERE e.id = $1`;
    
    const rows = await this.query(query, [eventId]);
    return rows[0];
  }

  /**
   * Add new event
   */
  async addEvent(userId, eventData) {
    const {
      title,
      description = null,
      date,
      location = null, // Make location optional
      category = null,
      capacity = null,
      status = 'active',
      organizer = null,
      tags = null,
      event_picture = null
    } = eventData;

    // Only require title and date
    if (!title?.trim() || !date) {
      throw new Error('Title and date are required');
    }

    const query = `
      INSERT INTO events (
        user_id, title, description, date, location, 
        category, capacity, status, organizer, tags, event_picture
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) 
      RETURNING *`;
    
    const params = [userId, title, description, date, location, 
                   category, capacity, status, organizer, tags, event_picture];
    const rows = await this.query(query, params);
    return rows[0];
  }

  /**
   * Update event
   */
  async updateEvent(eventId, eventData) {
    const fields = [];
    const params = [eventId];
    let paramCount = 1;

    // Build dynamic update query
    Object.entries(eventData).forEach(([key, value]) => {
      if (key !== 'id' && key !== 'user_id' && key !== 'userId') { // Don't update these
        paramCount++;
        fields.push(`${key} = $${paramCount}`);
        params.push(value);
      }
    });

    if (fields.length === 0) {
      throw new Error('No fields to update');
    }

    const query = `
      UPDATE events 
      SET ${fields.join(', ')}
      WHERE id = $1 
      RETURNING *`;
    
    const rows = await this.query(query, params);
    return rows[0];
  }

  /**
   * Update event and return with first photo
   */
  async updateEventWithPhoto(eventId, eventData) {
    // First update the event
    await this.updateEvent(eventId, eventData);
    
    // Then return the updated event with first photo
    return this.getEventWithFirstPhoto(eventId);
  }

  /**
   * Delete event
   */
  async deleteEvent(userId, eventId) {
    const query = 'DELETE FROM events WHERE user_id = $1 AND id = $2 RETURNING *';
    const rows = await this.query(query, [userId, eventId]);
    return rows[0];
  }

  // ============================================
  // PHOTO METHODS
  // ============================================

  /**
   * Get photos for an event
   */
  async getPhotos(eventIdentifier, byUuid = true) {
    const field = byUuid ? 'event_uuid' : 'event_id';
    const query = `
      SELECT photo_id, original_name, s3_key, photo_url,
             width, height, uploaded_at 
      FROM event_photos 
      WHERE ${field} = $1 
      ORDER BY uploaded_at DESC`;
    
    return this.query(query, [eventIdentifier]);
  }

  /**
   * Add photo to event
   */
  async addPhoto(photoData) {
    const {
      event_uuid,
      photo_id,
      original_name,
      s3_key,
      width = null,
      height = null,
      uploaded_at = new Date()
    } = photoData;

    if (!event_uuid || !photo_id || !original_name || !s3_key) {
      throw new Error('event_uuid, photo_id, original_name, and s3_key are required');
    }

    const query = `
      INSERT INTO event_photos (event_uuid, photo_id, original_name, s3_key, width, height, uploaded_at) 
      VALUES ($1, $2, $3, $4, $5, $6, $7) 
      RETURNING *`;
    
    const params = [event_uuid, photo_id, original_name, s3_key, width, height, uploaded_at];
    const rows = await this.query(query, params);
    return rows[0];
  }

  /**
   * Delete photo
   */
  async deletePhoto(eventUuid, photoId) {
    const query = 'DELETE FROM event_photos WHERE event_uuid = $1 AND photo_id = $2 RETURNING *';
    const rows = await this.query(query, [eventUuid, photoId]);
    return rows[0];
  }
}

module.exports = EventsDAO;