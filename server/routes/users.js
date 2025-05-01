const express = require('express');
const router = express.Router();

const UserDAO = require('./../dao/UserDAO');
const UserController = require('./../controllers/UserController');
const adminMiddleware = require('./../middleware/adminMiddleware');


// Middleware enriching the request with a user controller
router.use((req, res, next) => {
  // Get the pool from the app
  const pool = req.app.get('pool');
  const userDAO = new UserDAO(pool);
  req.userController = new UserController(userDAO);
  next();
});

// Route level middleware

router.get('/',adminMiddleware, (req, res, next) => req.userController.getAllUsers(req, res, next));

router.get('/list-simple', (req, res, next) => {
  req.userController.getAllUsers(req, res, next, 'users/list-simple');
});
router.get('/list-expanded', (req, res, next) => {
  req.userController.getAllUsers(req, res, next, 'users/list-expanded');
});

router.post('/', (req, res, next) => req.userController.addUser(req, res, next));
router.put('/:id', (req, res, next) => req.userController.updateUser(req, res, next));
router.delete('/:id', (req, res, next) => req.userController.deleteUser(req, res, next));

module.exports = router;