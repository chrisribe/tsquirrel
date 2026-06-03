const Stripe = require('stripe');
const { TIERS, PURCHASABLE_TIERS } = require('../config/tiers');

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
   * POST /payment/checkout
   * Create Stripe Checkout Session with inline pricing
   */
  async createCheckoutSession(req, res, next) {
    try {
      if (!this.stripe) {
        return res.status(500).json({ error: 'Payment processing not configured' });
      }

      if (!req.session.user) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const { tier } = req.body;
      const tierConfig = TIERS[tier];

      if (!tierConfig || !PURCHASABLE_TIERS.includes(tier)) {
        return res.status(400).json({ error: 'Invalid tier' });
      }

      // Check for existing unprocessed payments before creating new session
      // Prevents double-charging if webhook failed
      const freshUser = await this.userDAO.getUserById(req.session.user.id);
      if (freshUser && freshUser.tier === 'free') {
        const recovered = await this.recoverMissedPayment(freshUser);
        if (recovered) {
          // Payment was found and applied - redirect to confirm instead of charging again
          const publicUrl = process.env.PUBLIC_URL || 'http://localhost:3000';
          return res.json({ url: `${publicUrl}/payment/confirm`, recovered: true });
        }
      }

      // User already on this tier or higher - no need to pay
      if (freshUser && freshUser.tier !== 'free') {
        return res.status(400).json({ error: 'Already upgraded. Refresh the page to see your new limits.' });
      }

      const publicUrl = process.env.PUBLIC_URL || 'http://localhost:3000';

      const session = await this.stripe.checkout.sessions.create({
        mode: 'payment',
        line_items: [{
          price_data: {
            currency: 'usd',
            unit_amount: tierConfig.amount,
            product_data: {
              name: tierConfig.name,
              description: tierConfig.description
            }
          },
          quantity: 1
        }],
        metadata: {
          userId: req.session.user.id.toString(),
          tier: tier
        },
        customer_email: req.session.user.email,
        success_url: `${publicUrl}/payment/confirm`,
        cancel_url: `${publicUrl}/galleries`
      });

      return res.json({ url: session.url });
    } catch (err) {
      console.error('Failed to create checkout session:', err);
      next(err);
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
      let freshUser = await this.userDAO.getUserById(req.session.user.id);
      
      // Fallback: If still free tier, check Stripe for recent payments
      // This handles webhook failures - user paid but webhook didn't fire
      if (freshUser && freshUser.tier === 'free' && this.stripe) {
        const recovered = await this.recoverMissedPayment(freshUser);
        if (recovered) {
          freshUser = await this.userDAO.getUserById(req.session.user.id);
        }
      }

      if (freshUser) {
        req.session.user = freshUser;
      }

      return res.render('layout-main', {
        template: 'payment/confirm-page',
        pageData: {
          user: req.session.user,
          tiers: TIERS
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
   * Check Stripe for recent successful payments and apply tier upgrade
   * Handles webhook failures - user paid but tier wasn't upgraded
   * @returns {boolean} true if a payment was recovered
   */
  async recoverMissedPayment(user) {
    try {
      // List recent completed checkout sessions (last 30 days)
      const thirtyDaysAgo = Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000);
      
      const sessions = await this.stripe.checkout.sessions.list({
        status: 'complete',
        limit: 50,
        created: { gte: thirtyDaysAgo }
      });

      // Find sessions matching this user's ID in metadata
      for (const session of sessions.data) {
        const tier = session.metadata?.tier;
        const metaUserId = session.metadata?.userId;

        if (tier && metaUserId && parseInt(metaUserId) === user.id) {
          console.log(`Recovering missed payment: session ${session.id}, tier ${tier}, user ${user.id}`);
          await this.userDAO.updateUserTier(user.id, tier);
          return true;
        }
      }

      return false;
    } catch (err) {
      console.error('Error recovering missed payment:', err);
      return false;
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

    // Get tier from checkout session metadata (set in createCheckoutSession)
    const tier = session.metadata?.tier;
    const metaUserId = session.metadata?.userId;
    
    if (!tier) {
      console.error(`No tier metadata on session ${session.id}`);
      return;
    }

    // Verify user ID matches if present (extra security)
    if (metaUserId && parseInt(metaUserId) !== user.id) {
      console.error(`User ID mismatch: metadata=${metaUserId}, found=${user.id}`);
      return;
    }

    console.log(`Processing tier upgrade: ${tier} for user ${user.id}`);

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
