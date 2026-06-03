const express = require('express');
const router = express.Router();
const UserDAO = require('../dao/UserDAO');
const AdminController = require('../controllers/AdminController');
const authMiddleware = require('../middleware/authMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');
const { validate } = require('../middleware/validateInput');

// All admin routes require authentication first, then admin role
router.use(authMiddleware);
router.use(adminMiddleware);

// Inject AdminController with DAO
router.use((req, res, next) => {
  const pool = req.app.get('pool');
  const userDAO = new UserDAO(pool);
  req.adminController = new AdminController(userDAO);
  next();
});

router.get('/', (req, res) => req.adminController.dashboard(req, res));
router.get('/users/:userId/galleries', (req, res) => req.adminController.viewUserGalleries(req, res));
router.patch('/users/:userId/status',
  validate({ userId: 'id', status: 'status' }),
  (req, res) => req.adminController.updateUserStatus(req, res)
);
router.patch('/users/:userId/tier',
  (req, res) => req.adminController.updateUserTier(req, res)
);

module.exports = router;
