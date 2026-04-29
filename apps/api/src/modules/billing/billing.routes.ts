import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import { BillingService } from './billing.service';
import { logger } from '../../utils/logger';

const router = Router();
const billingService = new BillingService();

// ── Stripe webhook — raw body, NO auth middleware ─────────────────────────
// This route is registered in app.ts with express.raw() BEFORE express.json()
export async function webhookHandler(req: Request, res: Response): Promise<void> {
  const signature = req.headers['stripe-signature'] as string | undefined;
  if (!signature) {
    res.status(400).json({ error: 'Missing stripe-signature header' });
    return;
  }

  try {
    // req.body is a Buffer because this route uses express.raw()
    await billingService.handleWebhook(req.body as Buffer, signature);
    res.json({ received: true });
  } catch (err) {
    logger.error('Webhook error', { error: (err as Error).message });
    res.status(400).json({ error: 'Webhook processing failed' });
  }
}

// ── All other billing routes require authentication ───────────────────────
router.use(authenticate);

// GET /billing/plan — return current plan + trial status
router.get('/plan', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const status = await billingService.getPlanStatus(req.user!.tenantId);
    res.json({ success: true, data: status });
  } catch (err) { next(err); }
});

// POST /billing/checkout — create Stripe Checkout Session, returns redirect URL
router.post('/checkout', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { priceId } = req.body as { priceId?: string };
    if (!priceId) {
      res.status(400).json({ error: 'priceId is required' });
      return;
    }

    const url = await billingService.createCheckoutSession({
      tenantId: req.user!.tenantId,
      priceId,
      userEmail: req.user!.email,
    });

    res.json({ success: true, data: { url } });
  } catch (err) { next(err); }
});

// POST /billing/portal — create Customer Portal Session
router.post('/portal', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const url = await billingService.createPortalSession(req.user!.tenantId);
    res.json({ success: true, data: { url } });
  } catch (err) { next(err); }
});

export default router;
