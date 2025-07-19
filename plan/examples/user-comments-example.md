# User Event Comments Implementation Plan

> **Status**: Example/Reference  
> **Estimated Effort**: 2-3 days

## Overview

Add user comments to event pages for better engagement between organizers and attendees.

### Goals
- Users can view and post comments on events
- Event organizers can moderate comments  
- Seamless HTMX integration

## Acceptance Criteria

- [ ] View comments on event detail pages
- [ ] Authenticated users can add comments
- [ ] Event organizers can delete comments
- [ ] Comments show author and timestamp
- [ ] HTMX form submission without page reload

## Technical Approach

**Database**: Add `comments` table
**Routes**: Extend `/server/routes/events.js` 
**Views**: Update event detail template
**Controller**: Add comment methods to `EventsController.js`

### Database Schema
```sql
CREATE TABLE comments (
  id SERIAL PRIMARY KEY,
  event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (LENGTH(content) > 0),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## Implementation Phases

### Phase 1: Database Setup (0.5 days)
- [ ] Create comments table in database
- [ ] Create `CommentsDAO.js` with basic methods
- [ ] Test database operations

### Phase 2: Backend API (1 day)  
- [ ] Add comment methods to `EventsController.js`
- [ ] Create comment routes in `events.js`
- [ ] Test API endpoints

### Phase 3: Frontend Integration (1 day)
- [ ] Add comment section to event detail template
- [ ] Implement HTMX form submission
- [ ] Style comment display

### Phase 4: Testing & Polish (0.5 days)
- [ ] Test all user scenarios
- [ ] Verify authorization works
- [ ] Check mobile compatibility

## Key Files

```
/server/
├── controllers/EventsController.js     # Add: addComment, deleteComment
├── dao/CommentsDAO.js                  # New file
├── routes/events.js                    # Add comment routes
└── views/event-detail-page.ejs         # Add comment section
```

## Sample Code

### CommentsDAO.js
```javascript
class CommentsDAO {
  async getByEventId(eventId) {
    // Return comments with user names, newest first
  }
  
  async create(eventId, userId, content) {
    // Create comment with validation
  }
  
  async delete(commentId, userId) {
    // Delete if user owns comment or event
  }
}
```

### Template Addition
```html
<!-- Add to event-detail-page.ejs -->
<% if (user) { %>
  <form hx-post="/events/<%= event.id %>/comments">
    <textarea name="content" required></textarea>
    <button type="submit">Comment</button>
  </form>
<% } %>

<div id="comments">
  <% comments.forEach(comment => { %>
    <div>
      <strong><%= comment.author %></strong> - <%= comment.created_at %>
      <% if (canDelete) { %>
        <button hx-delete="/comments/<%= comment.id %>">Delete</button>
      <% } %>
      <p><%= comment.content %></p>
    </div>
  <% }) %>
</div>
```

## Notes for Side Hustle Teams

- **Keep it simple**: Focus on core functionality first
- **Incremental testing**: Test each phase before moving on
- **Skip nice-to-haves**: Avoid complex features like threading initially  
- **Use existing patterns**: Follow EventGlimpse's existing code structure