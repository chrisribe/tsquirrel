// server/models/Event.js
class Event {
  constructor({id, title, description, date, userId, location}) {
    this.id = id;
    this.title = title;
    this.description = description;
    this.date = date instanceof Date ? date : new Date(date);
    this.userId = userId;
    this.location = location;
  }
  
  isUpcoming() {
    return this.date > new Date();
  }
}

module.exports = Event;