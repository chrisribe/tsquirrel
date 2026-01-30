const Stripe = require('stripe');

class PaymentController {
  constructor(userDAO) {
    this.userDAO = userDAO;
    this.stripe = null;
    
    // Initialize Stripe if secret key is available
    if (process.env.STRIPE_SECRET_KEY) {
      this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    }
  }

  /**
   * GET /payment/confirm
   * Success page after Stripe payment redirect
   */
  async showConfirmation(req, res, next) {
    try {
      if (!req.session.user) {
        return res.redirect('/auth/login');
      }

      // Refresh user data from database (webhook may have upgraded tier)
      const freshUser = await this.userDAO.getUserById(req.session.user.id);
      if (freshUser) {
        req.session.user = freshUser;
      }

      return res.render('layout-main', {
        template: 'payment/confirm-page',
        pageData: {
          user: req.session.user
        },
        pageTitle: 'Payment Successful - EventGlimpse',
        noIndex: true,
        pageAssets: {
          css: ['payment.css']
        }
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /payment/webhook
   * Stripe webhook endpoint for checkout.session.completed events
   * Raw body required for signature verification
   */
  async handleWebhook(req, res, next) {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!this.stripe) {
      console.error('Stripe not initialized - missing STRIPE_SECRET_KEY');
      return res.status(500).json({ error: 'Payment processing not configured' });
    }

    if (!webhookSecret) {
      console.error('STRIPE_WEBHOOK_SECRET not configured');
      return res.status(500).json({ error: 'Webhook not configured' });
    }

    let event;

    try {
      // Verify webhook signature
      event = this.stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
      console.error('Webhook signature verification failed:', err.message);
      return res.status(400).json({ error: 'Webhook signature verification failed' });
    }

    // Handle the event
    try {
      switch (event.type) {
        case 'checkout.session.completed':
          await this.handleCheckoutCompleted(event.data.object);
          break;
        default:
          console.log(`Unhandled event type: ${event.type}`);
      }

      res.json({ received: true });
    } catch (err) {
      console.error('Error processing webhook:', err);
      next(err);
    }
  }

  /**
   * Process checkout.session.completed event
   * Upgrade user tier based on purchased product
   */
  async handleCheckoutCompleted(session) {
    console.log('Processing checkout.session.completed:', session.id);

    // Extract customer email from Stripe session
    const customerEmail = session.customer_details?.email || session.customer_email;
    
    if (!customerEmail) {
      console.error('No customer email found in session:', session.id);
      return;
    }

    // Find user by email
    const user = await this.userDAO.getUserByEmail(customerEmail);
    
    if (!user) {
      console.error(`No user found with email: ${customerEmail} (session: ${session.id})`);
      return;
    }

    // Determine tier from session metadata or product
    let tier = 'free';
    
    // Check metadata first (if we set it during checkout)
    if (session.metadata && session.metadata.tier) {
      tier = session.metadata.tier;
    } else {
      // Fallback: derive from amount (testing values from .env.example)
      // Event Tier: $5 = 500 cents, Party Pack: $12 = 1200 cents
      const amount = session.amount_total; // in cents
      if (amount === 500) {
        tier = 'event';
      } else if (amount === 1200) {
        tier = 'partypack';
      }
    }

    // Upgrade user tier
    try {
      const updatedUser = await this.userDAO.updateUserTier(user.id, tier);
      console.log(`User ${user.id} (${customerEmail}) upgraded to tier: ${tier}`, updatedUser);
    } catch (err) {
      console.error(`Failed to upgrade user ${user.id} (${customerEmail}):`, err);
      throw err;
    }
  }
}

module.exports = PaymentController;
