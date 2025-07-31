# Admin User Management View - Implementation Plan

## Overview
Implement a simple admin interface for managing users and viewing their assets within the EventGlimpse application. This provides administrators with tools to monitor user activity, manage user accounts, and view asset statistics.

**Business Value**: Enables efficient user administration, reduces support overhead, and provides visibility into platform usage.

## Acceptance Criteria
- [ ] Admin-only accessible view showing all users in a table format
- [ ] Display user information: username, email, role, status, registration date
- [ ] Show asset counts per user: total events created, total photos uploaded
- [ ] Provide user management actions: pause/unpause, delete user
- [ ] Confirm user deletion with safety prompt
- [ ] Responsive design consistent with existing EventGlimpse UI
- [ ] Proper error handling and user feedback

## Technical Approach

### Database Changes
- Add `status` field to users table (active, paused, deleted)
- Create database migration for existing users

### Backend Architecture
- Extend UserDAO with asset counting and status management methods
- Create AdminController for admin-specific operations
- Add admin routes with proper middleware protection
- Utilize existing HTMX + EJS patterns

### Frontend Design
- Build admin dashboard using existing EJS layout system
- Use HTMX for dynamic user management actions
- Follow existing CSS/styling patterns

## Phases

### Phase 1: Database and DAO Enhancements (1-2 hours)
- [ ] Add user status field to database schema
- [ ] Create database migration for existing users
- [ ] Add getUsersWithAssetCounts() method to UserDAO
- [ ] Add updateUserStatus() method to UserDAO
- [ ] Test DAO methods with sample data

### Phase 2: Admin Controller and Routes (1-2 hours)
- [ ] Create AdminController with user management methods
- [ ] Add admin routes for user dashboard
- [ ] Add HTMX endpoints for user actions (pause/unpause/delete)
- [ ] Implement proper error handling and responses
- [ ] Test API endpoints

### Phase 3: Admin Interface Views (2-3 hours)
- [ ] Create admin dashboard EJS template
- [ ] Build user management table with asset counts
- [ ] Add action buttons with HTMX integration
- [ ] Implement confirmation dialogs for destructive actions
- [ ] Style interface to match existing design
- [ ] Test UI functionality and responsiveness

### Phase 4: Testing and Documentation (1 hour)
- [ ] Manual testing of all admin functions
- [ ] Test access control (non-admin users blocked)
- [ ] Verify data integrity after user operations
- [ ] Update documentation if needed
- [ ] Take screenshots of completed interface

## Dependencies
- Existing admin middleware (✅ available)
- PostgreSQL database with user/event tables (✅ available)
- EJS templating system (✅ available)
- HTMX for dynamic interactions (✅ available)

## Testing Strategy
1. **Unit Testing**: Test DAO methods for asset counting and user management
2. **Integration Testing**: Verify admin routes and middleware protection
3. **Manual Testing**: Exercise complete admin workflow in browser
4. **Security Testing**: Ensure non-admin users cannot access admin functions

## Rollback Plan
- Database changes are additive (status field with default values)
- New routes can be easily disabled or removed
- No modification to existing user management functionality
- Git revert possible for all changes

## File Locations and Components

### New Files
- `/server/controllers/AdminController.js` - Admin-specific operations
- `/server/routes/admin.js` - Admin dashboard routes  
- `/server/views/admin/` - Admin interface templates
- `/server/views/admin/dashboard-page.ejs` - Main admin dashboard

### Modified Files
- `/server/dao/UserDAO.js` - Add asset counting and status methods
- `/server/server.js` - Register admin routes
- Database schema - Add user status field

### Integration Points
- Uses existing admin middleware for access control
- Leverages existing EJS layout system
- Follows existing HTMX + respondWithTemplateOrJson patterns
- Integrates with current user and event data models

## Risk Mitigation
- **Low Risk**: Building on established patterns and middleware
- **Data Safety**: Soft deletes and status changes instead of hard deletes
- **Access Control**: Reuses proven admin middleware
- **Backwards Compatibility**: No breaking changes to existing functionality

## Implementation Notes
- Keep interface simple and functional over fancy styling
- Reuse existing CSS classes and components where possible
- Follow established naming conventions and file organization
- Prioritize data integrity and user safety in all operations