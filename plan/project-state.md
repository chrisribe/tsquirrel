# EventGlimpse Project State

> Last Updated: 2024-07-19
> Status: Active Development

## Project Overview

EventGlimpse is a web application for event management and photo sharing, built with Node.js/Express and PostgreSQL. Users can create events, share them via UUID-based links, and manage event galleries.

## Architecture

### Technology Stack
- **Backend**: Node.js with Express.js framework
- **Database**: PostgreSQL with connection pooling
- **Templating**: EJS with layout-main.ejs wrapper system
- **Frontend Enhancement**: HTMX for dynamic content updates
- **Authentication**: Session-based with PostgreSQL session storage
- **File Storage**: AWS S3 integration for image uploads
- **Deployment**: Docker containers with docker-compose

### Core Architecture Pattern
```
HTTP Request → Routes → Controllers → DAOs → Database
                ↓
          EJS Templates ← HTMX Integration
```

## Current Directory Structure

```
Eventglimpse/
├── server/                 # Main application server
│   ├── routes/            # Express route definitions
│   ├── controllers/       # Business logic controllers
│   ├── dao/              # Data Access Objects
│   ├── views/            # EJS templates
│   ├── middleware/       # Custom middleware
│   ├── models/           # Data models
│   ├── services/         # Business services
│   ├── static/           # Static assets (CSS, JS, images)
│   └── configs/          # Configuration files
├── db/                   # Database setup and migrations
├── infra/               # Infrastructure (AWS Lambda for image processing)
└── plan/                # Feature planning (NEW)
```

## Database Schema

### Core Tables
1. **users** - User authentication and profiles
   - Fields: id, username, password, email, role
   - Authentication: Argon2 password hashing

2. **events** - Event information and metadata
   - Fields: id, uuid, user_id, title, description, date, location, category, capacity, status, organizer, tags, event_picture, created_at
   - UUID-based public sharing links

3. **session** - Session storage (managed by connect-pg-simple)

## Current Features

### Authentication System
- **Location**: `/server/routes/auth.js`, `/server/controllers/AuthController.js`
- **Status**: ✅ Implemented
- **Features**: Registration, login, logout, session management
- **Security**: Argon2 password hashing, session-based auth

### Event Management
- **Location**: `/server/routes/events.js`, `/server/controllers/EventsController.js`
- **Status**: ✅ Implemented
- **Features**: Create, view, edit events with UUID-based sharing
- **Templates**: `/server/views/events/` folder

### User Profiles
- **Location**: `/server/routes/users.js`, `/server/controllers/ProfileController.js`
- **Status**: ✅ Implemented
- **Features**: User profile management

### Image Upload/Processing
- **Location**: `/infra/lambda-image-processor/`
- **Status**: ✅ Implemented
- **Features**: AWS S3 upload, Lambda-based image processing

## API Patterns

### Route Structure
- **Web Routes**: `/server/routes/web.js` - Main navigation
- **Auth Routes**: `/server/routes/auth.js` - Authentication endpoints
- **Event Routes**: `/server/routes/events.js` - Event CRUD operations
- **User Routes**: `/server/routes/users.js` - User management

### Controller Pattern
Controllers use `respondWithTemplateOrJson` middleware to handle both web and API requests:
```javascript
// Web request: renders EJS template
// API request: returns JSON response
```

### DAO Pattern
Data Access Objects provide clean database interface:
- `UserDAO.js` - User data operations
- `EventsDAO.js` - Event data operations
- `SessionSecretsDAO.js` - Session management

## Frontend Architecture

### Templating System
- **Main Layout**: `/server/views/layout-main.ejs`
- **Page Templates**: `/server/views/[page]-page.ejs`
- **Component Templates**: `/server/views/[component]/`

### HTMX Integration
- Dynamic content updates without full page reloads
- Form submissions with `hx-*` attributes
- Response handling for both HTML and JSON

### Static Assets
- **Location**: `/server/static/`
- **Organization**: CSS, JavaScript, and images

## Development Environment

### Setup Requirements
- Node.js (version in package.json)
- PostgreSQL database
- Docker and docker-compose
- AWS credentials (for S3 functionality)

### Available Scripts
```bash
npm run start-node     # Production start
npm run start-nodemon  # Development with auto-reload
npm start              # Environment-based start
```

### Environment Variables
Required variables (see `.env.example`):
- `DATABASE_URL` - PostgreSQL connection string
- AWS credentials for S3 functionality
- Session secrets

## Known Technical Debt

### Testing
- **Status**: ❌ No test infrastructure currently exists
- **Need**: Unit tests for controllers, integration tests for routes
- **Priority**: Medium - should be added for new features

### Code Quality
- **Status**: ❌ No linting setup
- **Need**: ESLint configuration for code consistency
- **Priority**: Low - nice to have

### Documentation
- **Status**: ⚠️ Limited API documentation
- **Need**: API endpoint documentation, setup instructions
- **Priority**: Medium

## Recent Changes

### Completed
- Basic event management system
- UUID-based event sharing
- AWS S3 image upload integration
- Session-based authentication

### In Progress
- Feature planning system (this folder)

## Integration Points

### External Services
- **AWS S3**: Image storage and management
- **AWS Lambda**: Image processing pipeline
- **PostgreSQL**: Primary data storage

### Security Considerations
- Password hashing with Argon2
- Session-based authentication
- CORS configuration
- Input validation (needs enhancement)

## Performance Considerations
- Database connection pooling implemented
- Static asset serving
- Image processing offloaded to Lambda

## Deployment
- Docker containers with docker-compose
- Database initialization scripts in `/db/`
- Environment-based configuration

---

## For LLM Context

When working on new features:

1. **Follow the established patterns**: Routes → Controllers → DAOs → Database
2. **Use existing middleware**: `respondWithTemplateOrJson` for API/web responses
3. **Template structure**: Create `[feature]-page.ejs` for new pages
4. **Database changes**: Add migration scripts to `/db/` folder
5. **Static assets**: Place in `/server/static/` with appropriate organization
6. **HTMX integration**: Use `hx-*` attributes for dynamic behavior

### Common File Locations
- Add routes: `/server/routes/[feature].js`
- Add controller: `/server/controllers/[Feature]Controller.js`
- Add DAO: `/server/dao/[Feature]DAO.js`
- Add templates: `/server/views/[feature]/` or `/server/views/[feature]-page.ejs`
- Add migrations: `/db/[nn]-[description].sql`