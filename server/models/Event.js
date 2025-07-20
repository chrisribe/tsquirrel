// server/models/Event.js
class Event {
  constructor({
    id, title, description, date, userId, location, 
    category, capacity, status, organizer, tags, event_picture
    }) {
    this.id = id;
    this.title = title;
    this.description = description;
    this.date = date instanceof Date ? date : new Date(date);
    this.userId = userId;
    this.location = location;
    this.status = status || 'upcoming'; // Default status
    
    // Handle capacity - convert empty string to null, ensure it's a valid integer or null
    if (capacity === '' || capacity === undefined || capacity === null) {
      this.capacity = null;
    } else if (typeof capacity === 'string') {
      const parsedCapacity = parseInt(capacity, 10);
      this.capacity = isNaN(parsedCapacity) ? null : parsedCapacity;
    } else {
      this.capacity = capacity;
    }
    
    this.category = category;
    this.organizer = organizer || 'Unknown'; // Default organizer
    
    // Handle tags - should be a string (comma-separated) or null, not an array
    if (tags === undefined || tags === null || tags === '' || (Array.isArray(tags) && tags.length === 0)) {
      this.tags = null;
    } else if (Array.isArray(tags)) {
      // If tags is an array, join it as comma-separated string
      this.tags = tags.join(', ');
    } else {
      this.tags = tags;
    }
    
    this.event_picture = event_picture || null; // Default event picture
  }

  
  isUpcoming() {
    return this.date > new Date();
  }
}

module.exports = Event;