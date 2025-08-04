const express = require('express');
const router = express.Router();

const UserDAO = require('./../dao/UserDAO');
const AdminController = require('./../controllers/AdminController');
const adminMiddleware = require('./../middleware/adminMiddleware');

// Controller Injection Middleware
// -------------------------------
// This middleware runs on every request to admin routes.
// It retrieves the database pool from application settings and sets up required DAOs and controllers.
router.use((req, res, next) => {
  const pool = req.app.get('pool');
  const userDAO = new UserDAO(pool);
  // Create a fresh instance of AdminController for each request to avoid shared state issues
  req.adminController = new AdminController(userDAO);
  next();
});

// Apply admin middleware to all admin routes
router.use(adminMiddleware);

// Routes
// ------

// Admin dashboard - main view with user list and asset counts
router.get('/', (req, res, next) => req.adminController.getDashboard(req, res, next));
router.get('/dashboard', (req, res, next) => req.adminController.getDashboard(req, res, next));

// User management actions
router.post('/users/:id/status', (req, res, next) => req.adminController.updateUserStatus(req, res, next));
router.delete('/users/:id', (req, res, next) => req.adminController.deleteUser(req, res, next));
router.get('/users/:id', (req, res, next) => req.adminController.getUserDetails(req, res, next));

module.exports = router;