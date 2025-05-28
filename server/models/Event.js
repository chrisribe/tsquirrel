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
    this.capacity = capacity;
    this.category = category;
    this.organizer = organizer || 'Unknown'; // Default organizer
    this.tags = tags || []; // Default tags
    this.event_picture = event_picture || null; // Default event picture
  }

  
  isUpcoming() {
    return this.date > new Date();
  }
}

module.exports = Event;