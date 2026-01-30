const express = require('express');
const router = express.Router();
const UserDAO = require('../dao/UserDAO');
const PaymentController = require('../controllers/PaymentController');
const authMiddleware = require('../middleware/authMiddleware');

// Inject PaymentController with DAO on each request
router.use((req, res, next) => {
  const pool = req.app.get('pool');
  const userDAO = new UserDAO(pool);
  req.paymentController = new PaymentController(userDAO);
  next();
});

// Payment confirmation page (requires auth)
router.get('/confirm', authMiddleware, (req, res, next) => 
  req.paymentController.showConfirmation(req, res, next)
);

// Stripe webhook (raw body needed for signature verification)
// Note: This route needs express.raw() middleware applied in server.js
router.post('/webhook', (req, res, next) => 
  req.paymentController.handleWebhook(req, res, next)
);

module.exports = router;
