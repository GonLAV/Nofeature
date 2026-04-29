import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import db from '../../config/database';
import { authenticate, authorize } from '../../middleware/auth';
import { logger } from '../../utils/logger';

const router = Router();
router.use(authenticate);

const VALID_EVENTS = [
  'incident.created', 'incident.updated', 'incident.resolved',
  'incident.severity_changed', 'maintenance.scheduled',
];

const schema = z.object({
  url: z.string().url(),
  secret: z.string().min(8).max(200).optional(),
  events: z.array(z.enum(VALID_EVENTS as [string, ...string[]])).min(1),
  is_active: z.boolean().optional(),
});

router.get('/', authorize('owner', 'admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { rows } = await db.query(
      `SELECT id, url, events, is_active, last_status, last_attempt_at, failure_count, created_at
       FROM webhooks WHERE tenant_id = $1 ORDER BY created_at DESC`,
      [req.user!.tenantId]
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

router.post('/', authorize('owner', 'admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = schema.parse(req.body);
    const { rows } = await db.query(
      `INSERT INTO webhooks (tenant_id, url, secret, events, is_active)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING id, url, events, is_active, created_at`,
      [req.user!.tenantId, b.url, b.secret ?? null, b.events, b.is_active ?? true]
    );
    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
});

router.delete('/:id', authorize('owner', 'admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await db.query(`DELETE FROM webhooks WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, req.user!.tenantId]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.post('/:id/test', authorize('owner', 'admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM webhooks WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, req.user!.tenantId]
    );
    const wh = rows[0];
    if (!wh) return res.status(404).json({ success: false, error: 'Not found' });
    const status = await deliverWebhook(wh, 'test', { message: 'Test ping from Incident War Room' });
    res.json({ success: true, data: { status } });
  } catch (err) { next(err); }
});

interface WebhookRow {
  id: string; tenant_id: string; url: string; secret: string | null;
  events: string[]; is_active: boolean;
}

export async function deliverWebhook(wh: WebhookRow, event: string, payload: object): Promise<number | null> {
  const body = JSON.stringify({ event, timestamp: new Date().toISOString(), data: payload });
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Webhook-Event': event,
  };
  if (wh.secret) {
    const sig = crypto.createHmac('sha256', wh.secret).update(body).digest('hex');
    headers['X-Webhook-Signature'] = `sha256=${sig}`;
  }
  try {
    const r = await fetch(wh.url, { method: 'POST', headers, body, signal: AbortSignal.timeout(10_000) });
    await db.query(
      `UPDATE webhooks SET last_status = $1, last_attempt_at = NOW(),
         failure_count = CASE WHEN $1 BETWEEN 200 AND 299 THEN 0 ELSE failure_count + 1 END
       WHERE id = $2`,
      [r.status, wh.id]
    );
    return r.status;
  } catch (e) {
    logger.error('webhook delivery failed', e);
    await db.query(
      `UPDATE webhooks SET last_status = NULL, last_attempt_at = NOW(),
         failure_count = failure_count + 1 WHERE id = $1`,
      [wh.id]
    );
    return null;
  }
}

// Helper: dispatch event to all matching webhooks for tenant (fire-and-forget)
export async function dispatchEvent(tenantId: string, event: string, payload: object): Promise<void> {
  try {
    const { rows } = await db.query(
      `SELECT * FROM webhooks WHERE tenant_id = $1 AND is_active = true AND $2 = ANY(events)`,
      [tenantId, event]
    );
    await Promise.all(rows.map((wh: WebhookRow) => deliverWebhook(wh, event, payload)));
  } catch (e) {
    logger.error('dispatchEvent failed', e);
  }
}

export default router;
