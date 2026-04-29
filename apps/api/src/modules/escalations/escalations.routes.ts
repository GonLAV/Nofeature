import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import db from '../../config/database';
import { authenticate, authorize } from '../../middleware/auth';

const router = Router();
router.use(authenticate);

// ── Escalation policies ─────────────────────────────────────
router.get('/policies', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { rows } = await db.query(
      `SELECT p.*, (
         SELECT json_agg(json_build_object(
           'id', s.id, 'step_order', s.step_order, 'delay_minutes', s.delay_minutes,
           'user_id', s.user_id, 'schedule_id', s.schedule_id,
           'user_name', u.name, 'schedule_name', sch.name
         ) ORDER BY s.step_order)
         FROM escalation_steps s
         LEFT JOIN users u ON u.id = s.user_id
         LEFT JOIN oncall_schedules sch ON sch.id = s.schedule_id
         WHERE s.policy_id = p.id
       ) AS steps
       FROM escalation_policies p
       WHERE p.tenant_id = $1
       ORDER BY p.name`,
      [req.user!.tenantId]
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

const policySchema = z.object({
  name: z.string().min(1).max(100),
  trigger_severity: z.enum(['P1', 'P2', 'P3', 'P4']).optional(),
});

router.post('/policies', authorize('owner', 'admin', 'manager'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = policySchema.parse(req.body);
    const { rows } = await db.query(
      `INSERT INTO escalation_policies (tenant_id, name, trigger_severity)
       VALUES ($1, $2, $3) RETURNING *`,
      [req.user!.tenantId, b.name, b.trigger_severity ?? null]
    );
    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
});

router.delete('/policies/:id', authorize('owner', 'admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await db.query(`DELETE FROM escalation_policies WHERE id = $1 AND tenant_id = $2`, [req.params.id, req.user!.tenantId]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

const stepSchema = z.object({
  step_order: z.number().int().min(1).max(20),
  delay_minutes: z.number().int().min(0).max(1440),
  user_id: z.string().uuid().optional(),
  schedule_id: z.string().uuid().optional(),
}).refine((d) => d.user_id || d.schedule_id, { message: 'user_id or schedule_id required' });

router.post('/policies/:id/steps', authorize('owner', 'admin', 'manager'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = stepSchema.parse(req.body);
    // verify policy ownership
    const ok = await db.query(`SELECT 1 FROM escalation_policies WHERE id = $1 AND tenant_id = $2`, [req.params.id, req.user!.tenantId]);
    if (!ok.rows[0]) return res.status(404).json({ success: false, error: 'Policy not found' });
    const { rows } = await db.query(
      `INSERT INTO escalation_steps (policy_id, step_order, delay_minutes, user_id, schedule_id)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.params.id, b.step_order, b.delay_minutes, b.user_id ?? null, b.schedule_id ?? null]
    );
    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
});

router.delete('/steps/:id', authorize('owner', 'admin', 'manager'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await db.query(
      `DELETE FROM escalation_steps s USING escalation_policies p
       WHERE s.id = $1 AND s.policy_id = p.id AND p.tenant_id = $2`,
      [req.params.id, req.user!.tenantId]
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ── Notification preferences ────────────────────────────────
router.get('/notification-prefs', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM user_notification_prefs WHERE user_id = $1`,
      [req.user!.userId]
    );
    if (rows[0]) return res.json({ success: true, data: rows[0] });
    // Defaults
    res.json({
      success: true,
      data: {
        user_id: req.user!.userId,
        email_on_assigned: true,
        email_on_p1: true,
        email_on_status_change: false,
        digest_weekly: true,
        quiet_hours_start: null,
        quiet_hours_end: null,
      },
    });
  } catch (err) { next(err); }
});

const prefsSchema = z.object({
  email_on_assigned: z.boolean().optional(),
  email_on_p1: z.boolean().optional(),
  email_on_status_change: z.boolean().optional(),
  digest_weekly: z.boolean().optional(),
  quiet_hours_start: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).nullable().optional(),
  quiet_hours_end: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).nullable().optional(),
});

router.put('/notification-prefs', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = prefsSchema.parse(req.body);
    const { rows } = await db.query(
      `INSERT INTO user_notification_prefs (
         user_id, email_on_assigned, email_on_p1, email_on_status_change,
         digest_weekly, quiet_hours_start, quiet_hours_end
       )
       VALUES ($1, COALESCE($2, TRUE), COALESCE($3, TRUE), COALESCE($4, FALSE),
               COALESCE($5, TRUE), $6, $7)
       ON CONFLICT (user_id) DO UPDATE SET
         email_on_assigned = COALESCE($2, user_notification_prefs.email_on_assigned),
         email_on_p1 = COALESCE($3, user_notification_prefs.email_on_p1),
         email_on_status_change = COALESCE($4, user_notification_prefs.email_on_status_change),
         digest_weekly = COALESCE($5, user_notification_prefs.digest_weekly),
         quiet_hours_start = $6,
         quiet_hours_end = $7,
         updated_at = NOW()
       RETURNING *`,
      [
        req.user!.userId,
        b.email_on_assigned ?? null,
        b.email_on_p1 ?? null,
        b.email_on_status_change ?? null,
        b.digest_weekly ?? null,
        b.quiet_hours_start ?? null,
        b.quiet_hours_end ?? null,
      ]
    );
    res.json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
});

export default router;
