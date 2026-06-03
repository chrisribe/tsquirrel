const express = require('express');
const router = express.Router();
const UserDAO = require('../dao/UserDAO');
const UserController = require('../controllers/UserController');
const authMiddleware = require('../middleware/authMiddleware');
const { validate } = require('../middleware/validateInput');

// Inject UserController with DAO on each request
router.use((req, res, next) => {
  const pool = req.app.get('pool');
  const userDAO = new UserDAO(pool);
  req.userController = new UserController(userDAO);
  req.userDAO = userDAO;
  next();
});

// Get current user (for payment confirmation polling)
router.get('/me', authMiddleware, async (req, res, next) => {
  try {
    // Always get fresh data from DB
    const user = await req.userDAO.getUserById(req.session.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    // Update session if tier changed
    if (user.tier !== req.session.user.tier) {
      req.session.user = user;
    }
    res.json({ tier: user.tier, username: user.username, email: user.email });
  } catch (err) {
    next(err);
  }
});

// Routes (protected)
router.get('/', authMiddleware, (req, res, next) => req.userController.getAllUsers(req, res, next));
router.post('/', authMiddleware,
  validate({ username: 'username', email: 'email', password: 'password' }),
  (req, res, next) => req.userController.addUser(req, res, next)
);
router.put('/:id', authMiddleware,
  validate({ id: 'id', username: 'username', email: 'email', password: ['optional', 'password'] }),
  (req, res, next) => req.userController.updateUser(req, res, next)
);
router.delete('/:id', authMiddleware,
  validate({ id: 'id' }),
  (req, res, next) => req.userController.deleteUser(req, res, next)
);

module.exports = router;
