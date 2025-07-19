# User Event Comments Implementation Plan

> **Status**: Example/Reference
> **Created**: 2024-07-19
> **Last Updated**: 2024-07-19
> **Estimated Effort**: 3-4 days

## Overview

Add the ability for users to comment on events, enabling better engagement and communication around events. This feature will allow event attendees to ask questions, share updates, and interact with the event organizer and other participants.

### Business Value
- Increased user engagement with events
- Better communication between organizers and attendees
- Community building around events
- Improved event feedback and interaction

## Acceptance Criteria

- [ ] Users can view comments on event detail pages
- [ ] Authenticated users can add comments to events
- [ ] Event organizers can moderate (delete) comments on their events
- [ ] Comments display author name and timestamp
- [ ] Comments are displayed in chronological order (newest first)
- [ ] Comment submission uses HTMX for seamless user experience
- [ ] Basic input validation prevents empty comments

## Technical Approach

### Architecture Overview
This feature extends the existing event system by adding a comments layer:
- **Routes**: Add comment endpoints to `/server/routes/events.js`
- **Controller**: Extend `EventsController.js` with comment methods
- **DAO**: Create `CommentsDAO.js` for comment data operations
- **Database**: Add `comments` table with foreign key to events
- **Templates**: Enhance event detail page with comment section

### Database Changes
```sql
-- Add comments table
CREATE TABLE IF NOT EXISTS comments (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT comments_content_check CHECK (LENGTH(content) > 0 AND LENGTH(content) <= 1000)
);

-- Add index for faster event comment queries
CREATE INDEX idx_comments_event_id ON comments(event_id);
CREATE INDEX idx_comments_created_at ON comments(created_at DESC);
```

### API Endpoints
| Method | Endpoint | Description | Request | Response |
|--------|----------|-------------|---------|----------|
| GET | `/events/:uuid/comments` | Get comments for event | `{}` | `[{comment}]` |
| POST | `/events/:uuid/comments` | Add comment | `{content}` | `{comment}` |
| DELETE | `/comments/:id` | Delete comment (organizer only) | `{}` | `{success}` |

### File Changes

**New Files:**
- `/server/dao/CommentsDAO.js` - Comment data access operations
- `/server/views/events/comments-section.ejs` - Comment display component
- `/db/03-comments.sql` - Database migration for comments table

**Modified Files:**
- `/server/routes/events.js` - Add comment routes
- `/server/controllers/EventsController.js` - Add comment controller methods
- `/server/views/events/detail-page.ejs` - Include comments section
- `/server/static/js/comments.js` - Client-side comment interactions (new)

## Implementation Phases

### Phase 1: Database and DAO Setup (1 day)
Set up the foundation for storing and retrieving comments.

**Tasks:**
- [x] Create database migration script (`/db/03-comments.sql`)
- [x] Create `CommentsDAO.js` with basic CRUD operations
- [x] Add method to get comments by event ID
- [x] Add method to create new comment
- [x] Add method to delete comment with authorization check

**Verification:**
- [x] Database migration runs successfully
- [x] DAO methods can be imported without errors
- [x] Basic database operations work in isolation

**Definition of Done:**
- Comments table exists with proper constraints
- DAO provides clean interface for comment operations
- Database indexes improve query performance

### Phase 2: API Endpoints (1 day)
Implement the backend API for comment operations.

**Tasks:**
- [ ] Add comment routes to `/server/routes/events.js`
- [ ] Implement `getEventComments` method in EventsController
- [ ] Implement `addComment` method with authentication check
- [ ] Implement `deleteComment` method with authorization check
- [ ] Add proper error handling and validation

**Verification:**
- [ ] GET `/events/:uuid/comments` returns event comments
- [ ] POST `/events/:uuid/comments` creates new comment (auth required)
- [ ] DELETE `/comments/:id` removes comment (organizer only)
- [ ] Proper error responses for invalid requests

**Definition of Done:**
- All API endpoints functional and tested
- Authentication and authorization working correctly
- Error handling provides helpful responses

### Phase 3: Frontend Templates (1 day)
Create the user interface for viewing and adding comments.

**Tasks:**
- [ ] Create `comments-section.ejs` component template
- [ ] Modify `detail-page.ejs` to include comments section
- [ ] Add comment form with HTMX attributes
- [ ] Style comment display with appropriate CSS
- [ ] Add client-side JavaScript for comment interactions

**Verification:**
- [ ] Comments display correctly on event detail page
- [ ] Comment form submits via HTMX without page reload
- [ ] Visual styling matches existing design patterns
- [ ] Mobile responsive design works

**Definition of Done:**
- Comments integrate seamlessly with event detail page
- HTMX provides smooth user experience
- Design is consistent with existing UI

### Phase 4: Integration and Polish (1 day)
Complete integration testing and add finishing touches.

**Tasks:**
- [ ] Test comment functionality end-to-end
- [ ] Add loading states and user feedback
- [ ] Implement comment validation (length, content checks)
- [ ] Add organizer-only delete buttons
- [ ] Test with various user roles and permissions

**Verification:**
- [ ] All user flows work smoothly
- [ ] Permission checks prevent unauthorized actions
- [ ] User feedback is clear and helpful
- [ ] No conflicts with existing features

**Definition of Done:**
- Feature works reliably across all scenarios
- Security requirements fully implemented
- User experience is polished and intuitive

## Dependencies

### Prerequisites
- [x] Event system must be functional
- [x] User authentication system must be in place
- [x] HTMX integration must be working

### External Dependencies
- None - uses existing technology stack

## Testing Strategy

### Manual Testing
1. **Happy Path**: 
   - Navigate to event detail page
   - View existing comments
   - Add a new comment (requires login)
   - See comment appear without page reload

2. **Error Cases**:
   - Try to comment without authentication → redirect to login
   - Submit empty comment → validation error
   - Try to delete someone else's comment → permission error

3. **Integration**:
   - Comments persist across page reloads
   - Comments appear for all users viewing the event
   - Event organizer can delete any comment

4. **Security**:
   - Only authenticated users can comment
   - Only event organizers can delete comments
   - Input sanitization prevents XSS

### Automated Testing
For this example, we would add:
- Unit tests for CommentsDAO methods
- Integration tests for comment API endpoints
- Tests for authorization logic

## Security Considerations

- **Authentication**: Must be logged in to comment
- **Authorization**: Only event organizers can delete comments
- **Input Validation**: Comments limited to 1000 characters, no empty comments
- **XSS Prevention**: Proper template escaping for comment content
- **SQL Injection**: Use parameterized queries in DAO

## Performance Considerations

- **Database**: Index on event_id for fast comment retrieval
- **Caching**: Consider caching comment counts for events
- **Pagination**: May need pagination for events with many comments
- **Loading**: HTMX provides fast, non-blocking comment submission

## Rollback Plan

1. **Database**: Drop comments table and indexes
2. **Code**: Revert to commit before comment feature
3. **Templates**: Remove comment sections from event pages
4. **Routes**: Remove comment endpoints

Safe rollback points:
- After Phase 1: Database changes only
- After Phase 2: API functional but no UI
- After Phase 3: Full feature ready

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Performance impact on event pages | Medium | Low | Add database indexes, implement pagination |
| Spam comments | Medium | Medium | Add rate limiting, content moderation tools |
| UI doesn't match existing design | Low | Medium | Follow existing EJS/CSS patterns closely |

## Notes

This feature serves as a foundation for future enhancements like:
- Comment replies/threading
- Comment reactions/likes
- Email notifications for new comments
- Rich text formatting in comments

Alternative approaches considered:
- Real-time comments with WebSockets (too complex for initial version)
- Third-party comment system (reduces control and customization)

---

## Progress Tracking

**Overall Progress**: 25% complete (Phase 1 done)

**Current Phase**: Phase 2 - API Endpoints

**Next Steps**: 
- [ ] Add comment routes to events.js
- [ ] Implement controller methods

**Blockers**: 
- None currently

**Lessons Learned**:
- Database migration worked smoothly with existing setup
- DAO pattern integrates well with existing code structure
- Planning detailed phases helps maintain focus