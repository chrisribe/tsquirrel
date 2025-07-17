# Events Dashboard Redesign Implementation Plan

## Design Guidelines & Style Standards

### **Color Scheme - Simplified Black & White**
- **Primary Actions**: Black background (#333), white text
- **Secondary Actions**: White background, black text (#333), black border
- **Hover States**: Inverted colors (black ↔ white)
- **Delete Actions**: Red (#dc3545) for safety/warning
- **Help Text**: Light gray background (#f8f9fa), dark gray text (#333)
- **Borders**: Subtle gray (#dee2e6) or black (#333)

### **Button Standards**
```css
/* Primary Button */
background: #333, color: white, border: #333
hover: #555 background

/* Secondary Button */  
background: white, color: #333, border: #333
hover: #333 background, white text

/* Consistent Properties */
font-weight: 500, border-radius: var(--pico-border-radius)
box-shadow: 0 1px 3px rgba(0,0,0,0.1)
transition: all 0.2s ease
```

### **Typography**
- **High Contrast**: Always ensure readability
- **Font Weight**: 500 for buttons, normal for body text
- **No Complex Colors**: Stick to black, white, gray variants

---

## Overview
Transform the current events list interface into an intuitive dashboard that helps users create, manage, and avoid duplicating events. Focus on MVP functionality with clear user flows.

## User Goals
- Create new events easily
- Manage existing events (edit, view, delete)
- Avoid recreating duplicate events
- Clear distinction between upcoming and past events
- Prepare foundation for future gallery sharing features

---

## Phase 1: Foundation & Empty State

### 1.1 Enhanced Empty State
**Files to modify:**
- `server/views/events/events-list.ejs`

**Changes:**
- Replace simple "No events available" text
- Add engaging illustration/icon
- Include explanatory text about event creation
- Large, prominent "Create Your First Event" button
- Brief description of EventGlimpse purpose

### 1.2 Header Restructure
**Files to modify:**
- `server/views/events-page.ejs`
- `server/static/css/events.css`

**Changes:**
- Move "Create New Event" button to header area (not floating)
- Add event count display ("You have X upcoming events")
- Keep search functionality in prominent position
- Remove floating action button (FAB)

---

## Phase 2: Event Status Logic

### 2.1 Backend Data Preparation
**Files to check/modify:**
- `server/dao/EventsDAO.js`
- `server/controllers/EventsController.js`
- `server/models/Event.js`

**Tasks:**
- Verify event date fields are properly stored
- Add logic to classify events as upcoming/past based on current date
- Ensure proper date formatting and timezone handling
- Add event count queries if needed

### 2.2 Template Structure Updates
**Files to modify:**
- `server/views/events/events-list.ejs`
- `server/views/events/event-item.ejs`

**Changes:**
- Split events display into "Upcoming Events" and "Past Events" sections
- Add section headers with counts
- Prepare event items for different action sets
- Maintain responsive grid layout

---

## Phase 3: Enhanced Event Cards & Picture Management ✅ COMPLETED

### 3.1 Action Buttons Implementation ✅ COMPLETED
**Files modified:**
- `server/views/events/event-item.ejs` - Added action buttons for upcoming/past events
- `server/static/css/events.css` - Styled buttons with black/white theme
- `server/routes/events.js` - Added GET /:id/edit route
- `server/views/events/event-edit-modal.ejs` - **NEW: Tabbed edit interface**
- `server/static/js/main.js` - Added tab navigation functionality

**Implemented Features:**
- **Tabbed Edit Modal** with sections:
  - 📝 Event Details - Basic information editing
  - 🖼️ Cover Photo - Photo selection (only shows if photos exist)
  - ⚙️ Advanced - Category, capacity, tags
- **Upcoming Events Actions:**
  - [Edit] - Opens tabbed edit modal with cover photo selection
  - [View Gallery] - Shows event photos
  - [Share] - Generates share link
- **Past Events Actions:**
  - [Edit] - Enhanced for post-event updates (thank you notes, memories)
  - [View Gallery] - Shows uploaded photos
  - [Share] - Generates share link
- **Edit Modal Enhancements:**
  - Cover photo selection from uploaded images
  - Basic event details editing (title, date, location, description)
  - Photo management interface

### 3.2 Visual Status Indicators & Event Pictures
**Files to modify:**
- `server/static/css/events.css`
- `server/views/events/event-item.ejs`
- `server/dao/EventsDAO.js`
- `server/controllers/EventsController.js`

**Changes:**
- ✅ **COMPLETED** - Black and white color scheme for buttons
- ✅ **COMPLETED** - High contrast action buttons with hover states
- Status badges with simplified colors
- Improved date formatting (relative dates)
- Visual hierarchy improvements
- ✅ **COMPLETED** - Readable help text styling

**Event Picture Enhancement:**
- ✅ **COMPLETED** - Auto-select first uploaded photo as event card image
- ✅ **COMPLETED** - User-selectable cover photo in edit mode
- ✅ **COMPLETED** - Fallback hierarchy: User selected → First photo → Default image
- ✅ **COMPLETED** - Optimized display: Use thumbnail versions for fast loading
- ✅ **COMPLETED** - Update logic: When photos added/removed, refresh card images
- ✅ **COMPLETED** - Edit interface: Photo picker in edit modal for cover selection

---

## Phase 4: Enhanced Creation & Duplicate Prevention

### 4.1 Smart Search Enhancement
**Files to modify:**
- `server/controllers/EventsController.js`
- `server/static/js/main.js` (if needed)

**Changes:**
- Real-time search feedback during event creation
- Highlight similar events when typing new event names
- Suggest existing events instead of creating duplicates
- Improve search performance and UX
- Add "Did you mean..." functionality

### 4.2 Enhanced Event Creation Form
**Files to modify:**
- `server/views/events/event-form-add.ejs`
- `server/static/css/events.css`
- `server/controllers/EventsController.js`
- `server/dao/EventsDAO.js`

**Changes:**
- **Core Fields (Always Visible):**
  - Event Title (required)
  - Date & Time (required)
  - Location (required)
  - [Quick Create] button for minimal events

- **Optional Details (Expandable Section):**
  - Welcome Message - Personal greeting for guests
  - Description - Additional event details
  - Event Category - Birthday, Party, Meeting, etc.
  - Capacity - Maximum attendees
  - Event Picture - Upload visual
  - Tags - Searchable keywords

- **UX Improvements:**
  - "Add More Details" toggle to expand optional fields
  - Progressive disclosure - show complexity only when needed
  - Better form validation and error handling
  - Success messaging improvements
  - **Consistent Styling**: Apply black/white button scheme
  - **Readable Help Text**: Light gray backgrounds with dark text

---

## Files Overview

### Primary Files to Modify:
```
server/views/
├── events-page.ejs              # Main page structure
└── events/
    ├── events-list.ejs          # Sectioned event display
    ├── event-item.ejs           # Individual event cards with dynamic images
    ├── event-form-add.ejs       # Creation form improvements
    └── event-edit-modal.ejs     # Edit form with cover photo selection (new)

server/static/css/
└── events.css                   # All styling updates

server/controllers/
└── EventsController.js          # Date logic, new actions, image handling

server/dao/
└── EventsDAO.js                 # Query improvements, cover image logic

server/routes/
└── events.js                    # New route handling for edit operations
```

### Preservation Strategy:
- ✅ Keep existing HTMX functionality
- ✅ Maintain modal form system
- ✅ Preserve search implementation
- ✅ Keep responsive design patterns
- ✅ Maintain current authentication flow

---

## Implementation Order

1. **Start with Phase 1** ✅ **COMPLETED** - Foundation changes that improve immediate UX
2. **Phase 2** ✅ **COMPLETED** - Backend logic for proper event classification  
3. **Phase 3** ✅ **COMPLETED** - Enhanced UI, interactions, and dynamic event pictures
4. **Phase 4** - Enhanced creation form and duplicate prevention

## Completed Features ✅

### **Phase 1 - Foundation & Empty State**
- ✅ Enhanced empty state with engaging content
- ✅ Header restructure with prominent "Create New Event" button
- ✅ Removed hidden floating action button
- ✅ Event count display in header

### **Phase 2 - Event Status Logic**  
- ✅ Backend classification (upcoming/past events)
- ✅ Sectioned display with counts
- ✅ Enhanced search with categorization
- ✅ Event status indicators

## Tag System Implementation ✅ COMPLETED

### How Tags Work:
- **Input Format:** Comma-separated text (e.g. "family, celebration, work")
- **Storage:** VARCHAR(255) field in database as comma-separated string
- **Display:** Parsed and shown as individual badge elements on event cards
- **Search Integration:** Tags are fully searchable via the dashboard search box
- **UI Integration:** 
  - Available in both create and edit forms
  - Displayed as small rounded badges below event status
  - Help text guides users on proper format
  - Styled with subtle gray background for readability

### Enhanced Search Functionality ✅ COMPLETED:
The search now includes:
- **Event Title** - Main event name
- **Description** - Event details and notes
- **Location** - Venue or address
- **Tags** - All comma-separated tags (e.g. searching "family" finds events tagged with "family")
- **Category** - Event type (birthday, wedding, etc.)

**Search Examples:**
- `birthday` - Finds events with "birthday" in title, description, tags, or category
- `work` - Finds all work-related events regardless of where "work" appears
- `celebration` - Matches any celebration-tagged events

### Files Modified:
- `server/dao/EventsDAO.js` - Enhanced searchEvents() to include tags and category
- `server/views/events-page.ejs` - Updated search placeholder to indicate enhanced functionality
- `server/views/events/event-item.ejs` - Added tag display with badge styling
- `server/views/events/event-edit-modal.ejs` - Enhanced tag input with help text
- `server/views/events/event-form-add.ejs` - Added category and tags fields
- `server/controllers/EventsController.js` - Updated to handle category and tags
- `server/static/css/events.css` - Added tag badge and form help styling

### Future Enhancements:
- Tag-based filtering buttons (click tag to filter)
- Tag autocomplete based on user's previous tags
- Tag analytics/usage statistics
- ✅ Dynamic event pictures (user selected → first photo → default)
- ✅ Edit functionality for both upcoming and past events
- ✅ Photo selection in edit modal
- ✅ Action buttons with black/white styling
- ✅ Modal functionality fixes
- ✅ Simplified, high-contrast color scheme

## Success Metrics

- Users can immediately understand how to create events ✅
- Clear visual distinction between event states ✅
- Dynamic event pictures enhance visual appeal ✅
- Edit functionality available for all events ✅
- Simple black/white styling for accessibility ✅
- Improved user confidence in managing events ✅
- Foundation ready for gallery/sharing features ✅

---

## Notes

- Maintain existing EJS templating patterns
- Keep HTMX for dynamic interactions
- Use existing Pico CSS framework as base
- **OVERRIDE with simplified black/white styling for buttons and UI elements**
- Focus on MVP functionality
- Prepare but don't implement gallery sharing yet
- Test thoroughly on mobile devices
- **Ensure high contrast and accessibility with black/white color scheme**
- **Consistent button styling**: Primary (black), Secondary (white), Hover (inverted)

## Next Steps

**Phase 4 Ready**: Enhanced creation form with progressive disclosure and simplified styling
- Apply black/white button styling to all new components
- Use light gray backgrounds (#f8f9fa) for help text and info sections
- Maintain high contrast throughout the form interface
