const express = require('express');
const router = express.Router();

const UserDAO = require('./../dao/UserDAO');
const UserController = require('./../controllers/UserController');
const adminMiddleware = require('./../middleware/adminMiddleware');

// Controller Injection Middleware
// -------------------------------
// This middleware runs on every request to users routes.
// It retrieves the database pool from application settings and sets up required DAOs and controllers.
router.use((req, res, next) => {
  const pool = req.app.get('pool');
  const userDAO = new UserDAO(pool);
  // Create a fresh instance of UserController for each request avoids shared state issues
  req.userController = new UserController(userDAO);
  next();
});

// Routes
// ------
router.get('/',adminMiddleware, (req, res, next) => req.userController.getAllUsers(req, res, next));

router.get('/list-simple', (req, res, next) => {
  req.userController.getAllUsers(req, res, next, 'users/list-simple');
});
router.get('/list-expanded', (req, res, next) => {
  req.userController.getAllUsers(req, res, next, 'users/list-expanded');
});

router.post('/', (req, res, next) => userController.addUser(req, res, next));
router.put('/:id', (req, res, next) => userController.updateUser(req, res, next));
router.delete('/:id', (req, res, next) => userController.deleteUser(req, res, next));

module.exports = router;