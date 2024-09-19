const express = require('express');
const router = express.Router();

const UserDAO = require('./../dao/UserDAO');
const UserController = require('./../controllers/UserController');
const responseHandler = require('../middleware/responseHandler');

// Middleware enriching the request with a user controller
router.use((req, res, next) => {
  // Get the pool from the app
  const pool = req.app.get('pool');
  const userDAO = new UserDAO(pool);
  req.userController = new UserController(userDAO);
  next();
});

router.get('/', 
  responseHandler(), 
  (req, res, next) => req.userController.getAllUsers(req, res, next)
);
router.post('/', 
  responseHandler(), 
  (req, res, next) => req.userController.addUser(req, res, next)
);
router.put('/:id',
  responseHandler(), 
  (req, res, next) => req.userController.updateUser(req, res, next)
);
router.delete('/:id',
  responseHandler(),
  (req, res, next) => req.userController.deleteUser(req, res, next)
);

module.exports = router;