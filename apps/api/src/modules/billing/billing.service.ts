import Stripe from 'stripe';
import db from '../../config/database';
import { config } from '../../config/env';
import { logger } from '../../utils/logger';

export const PLANS = {
  starter: {
    key: 'starter',
    name: 'Starter',
    priceMonthly: 0,
    incidents: 5,
    users: 3,
    retentionDays: 7,
    features: [
      'Up to 5 active incidents',
      '3 team members',
      '7-day data retention',
      'Basic AI analysis',
      'Email notifications',
    ],
  },
  growth: {
    key: 'growth',
    name: 'Growth',
    priceMonthly: 299,
    incidents: -1,
    users: 25,
    retentionDays: 90,
    features: [
      'Unlimited active incidents',
      '25 team members',
      '90-day data retention',
      'Streaming AI analysis',
      'Real-time War Room chat',
      'Slack integration',
      'Post-mortem generation',
      'Priority support',
    ],
  },
  enterprise: {
    key: 'enterprise',
    name: 'Enterprise',
    priceMonthly: 999,
    incidents: -1,
    users: -1,
    retentionDays: 365,
    features: [
      'Everything in Growth',
      'Unlimited team members',
      '365-day data retention',
      'Custom AI model selection',
      'SSO / SAML',
      'Audit log export',
      'SLA guarantee',
      'Dedicated Slack support',
    ],
  },
} as const;

export type PlanKey = keyof typeof PLANS;

interface TenantBillingRow {
  id: string;
  name: string;
  plan: PlanKey;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_subscription_status: string | null;
  billing_email: string | null;
  trial_ends_at: Date | null;
}

function getStripe(): Stripe {
  if (!config.stripe.secretKey) {
    throw new Error('STRIPE_SECRET_KEY is not configured');
  }
  return new Stripe(config.stripe.secretKey, { apiVersion: '2024-06-20' });
}

export class BillingService {
  // ── Read tenant billing row ───────────────────────────────────────────────
  private async getTenant(tenantId: string): Promise<TenantBillingRow> {
    const { rows } = await db.query<TenantBillingRow>(
      `SELECT id, name, plan, stripe_customer_id, stripe_subscription_id,
              stripe_subscription_status, billing_email, trial_ends_at
       FROM tenants WHERE id = $1`,
      [tenantId],
    );
    if (!rows[0]) throw new Error('Tenant not found');
    return rows[0];
  }

  // ── Get or create Stripe customer ─────────────────────────────────────────
  private async ensureCustomer(
    tenant: TenantBillingRow,
    email: string,
  ): Promise<string> {
    if (tenant.stripe_customer_id) return tenant.stripe_customer_id;

    const stripe = getStripe();
    const customer = await stripe.customers.create({
      email,
      name: tenant.name,
      metadata: { tenantId: tenant.id },
    });

    await db.query(
      'UPDATE tenants SET stripe_customer_id = $1, billing_email = $2 WHERE id = $3',
      [customer.id, email, tenant.id],
    );

    logger.info('Stripe customer created', { tenantId: tenant.id, customerId: customer.id });
    return customer.id;
  }

  // ── Create Checkout Session ───────────────────────────────────────────────
  async createCheckoutSession(opts: {
    tenantId: string;
    priceId: string;
    userEmail: string;
  }): Promise<string> {
    const stripe = getStripe();
    const tenant = await this.getTenant(opts.tenantId);
    const customerId = await this.ensureCustomer(tenant, opts.userEmail);

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: opts.priceId, quantity: 1 }],
      success_url: `${config.appUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${config.appUrl}/billing`,
      metadata: { tenantId: opts.tenantId },
      subscription_data: {
        metadata: { tenantId: opts.tenantId },
        trial_from_plan: false,
      },
      allow_promotion_codes: true,
    });

    logger.info('Checkout session created', { tenantId: opts.tenantId, sessionId: session.id });
    return session.url!;
  }

  // ── Create Customer Portal Session ────────────────────────────────────────
  async createPortalSession(tenantId: string): Promise<string> {
    const stripe = getStripe();
    const tenant = await this.getTenant(tenantId);

    if (!tenant.stripe_customer_id) {
      throw new Error('No Stripe customer found — subscribe first');
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: tenant.stripe_customer_id,
      return_url: `${config.appUrl}/billing`,
    });

    return session.url;
  }

  // ── Handle Stripe Webhook ─────────────────────────────────────────────────
  async handleWebhook(payload: Buffer, signature: string): Promise<void> {
    const stripe = getStripe();

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(
        payload,
        signature,
        config.stripe.webhookSecret,
      );
    } catch (err) {
      logger.warn('Stripe webhook signature verification failed', {
        error: (err as Error).message,
      });
      throw err;
    }

    logger.info('Stripe webhook received', { type: event.type });

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        await this.onCheckoutComplete(session);
        break;
      }
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        await this.syncSubscription(sub);
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        await this.onSubscriptionCancelled(sub);
        break;
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        logger.warn('Payment failed', {
          customerId: invoice.customer,
          invoiceId: invoice.id,
        });
        break;
      }
    }
  }

  private async onCheckoutComplete(session: Stripe.Checkout.Session) {
    const tenantId = session.metadata?.tenantId;
    if (!tenantId || !session.subscription) return;

    const stripe = getStripe();
    const subscription = await stripe.subscriptions.retrieve(
      session.subscription as string,
      { expand: ['items.data.price.product'] },
    );

    const plan = this.planFromSubscription(subscription);

    await db.query(
      `UPDATE tenants
       SET stripe_subscription_id = $1,
           stripe_subscription_status = $2,
           plan = $3,
           updated_at = NOW()
       WHERE id = $4`,
      [subscription.id, subscription.status, plan, tenantId],
    );

    logger.info('Subscription activated', { tenantId, plan, subscriptionId: subscription.id });
  }

  private async syncSubscription(subscription: Stripe.Subscription) {
    const tenantId = subscription.metadata?.tenantId;
    if (!tenantId) return;

    const plan = this.planFromSubscription(subscription);

    await db.query(
      `UPDATE tenants
       SET stripe_subscription_status = $1, plan = $2, updated_at = NOW()
       WHERE stripe_subscription_id = $3`,
      [subscription.status, plan, subscription.id],
    );

    logger.info('Subscription synced', { tenantId, plan, status: subscription.status });
  }

  private async onSubscriptionCancelled(subscription: Stripe.Subscription) {
    await db.query(
      `UPDATE tenants
       SET stripe_subscription_status = 'cancelled', plan = 'starter', updated_at = NOW()
       WHERE stripe_subscription_id = $1`,
      [subscription.id],
    );

    logger.info('Subscription cancelled', { subscriptionId: subscription.id });
  }

  // Map Stripe price ID → our plan key
  private planFromSubscription(subscription: Stripe.Subscription): PlanKey {
    const priceId = subscription.items.data[0]?.price?.id;
    if (priceId === config.stripe.prices.enterprise) return 'enterprise';
    if (priceId === config.stripe.prices.growth) return 'growth';
    return 'starter';
  }

  // ── Get plan status (for the frontend billing page) ───────────────────────
  async getPlanStatus(tenantId: string) {
    const tenant = await this.getTenant(tenantId);
    const now = new Date();
    const trialActive =
      !!tenant.trial_ends_at && tenant.trial_ends_at > now;
    const trialDaysLeft = trialActive
      ? Math.ceil(
          (tenant.trial_ends_at!.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
        )
      : 0;

    const currentPlan = PLANS[tenant.plan] ?? PLANS.starter;
    const isSubscribed = tenant.stripe_subscription_status === 'active';

    return {
      plan: tenant.plan,
      planDetails: currentPlan,
      isSubscribed,
      subscriptionStatus: tenant.stripe_subscription_status,
      trial: {
        active: trialActive,
        daysLeft: trialDaysLeft,
        endsAt: tenant.trial_ends_at,
      },
      prices: {
        growth:     config.stripe.prices.growth,
        enterprise: config.stripe.prices.enterprise,
      },
      stripeConfigured: !!config.stripe.secretKey,
    };
  }
}
