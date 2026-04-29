import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import db from '../../config/database';
import { authenticate, authorize } from '../../middleware/auth';

const router = Router();
router.use(authenticate);

router.get('/schedules', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { rows } = await db.query(
      `SELECT s.*, (
         SELECT json_agg(json_build_object(
           'id', sh.id, 'user_id', sh.user_id, 'starts_at', sh.starts_at, 'ends_at', sh.ends_at,
           'user_name', u.name, 'user_email', u.email
         ) ORDER BY sh.starts_at)
         FROM oncall_shifts sh JOIN users u ON u.id = sh.user_id
         WHERE sh.schedule_id = s.id
       ) AS shifts
       FROM oncall_schedules s WHERE s.tenant_id = $1 ORDER BY s.created_at DESC`,
      [req.user!.tenantId]
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

const scheduleSchema = z.object({
  name: z.string().min(1).max(100),
  timezone: z.string().max(50).optional(),
  rotation_days: z.number().int().min(1).max(60).optional(),
});

router.post('/schedules', authorize('owner', 'admin', 'manager'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = scheduleSchema.parse(req.body);
    const { rows } = await db.query(
      `INSERT INTO oncall_schedules (tenant_id, name, timezone, rotation_days)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.user!.tenantId, b.name, b.timezone ?? 'UTC', b.rotation_days ?? 7]
    );
    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
});

router.delete('/schedules/:id', authorize('owner', 'admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await db.query(
      `DELETE FROM oncall_schedules WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, req.user!.tenantId]
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

const shiftSchema = z.object({
  user_id: z.string().uuid(),
  starts_at: z.string(),
  ends_at: z.string(),
});

router.post('/schedules/:id/shifts', authorize('owner', 'admin', 'manager'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = shiftSchema.parse(req.body);
    // Ensure schedule belongs to tenant
    const sched = await db.query(
      `SELECT id FROM oncall_schedules WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, req.user!.tenantId]
    );
    if (!sched.rows[0]) return res.status(404).json({ success: false, error: 'Schedule not found' });
    const { rows } = await db.query(
      `INSERT INTO oncall_shifts (schedule_id, user_id, starts_at, ends_at)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.params.id, b.user_id, b.starts_at, b.ends_at]
    );
    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
});

router.delete('/shifts/:id', authorize('owner', 'admin', 'manager'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await db.query(
      `DELETE FROM oncall_shifts sh USING oncall_schedules s
       WHERE sh.id = $1 AND sh.schedule_id = s.id AND s.tenant_id = $2`,
      [req.params.id, req.user!.tenantId]
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

// Currently on-call across all schedules
router.get('/now', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { rows } = await db.query(
      `SELECT s.id AS schedule_id, s.name AS schedule_name,
              u.id AS user_id, u.name AS user_name, u.email AS user_email,
              sh.starts_at, sh.ends_at
       FROM oncall_shifts sh
       JOIN oncall_schedules s ON s.id = sh.schedule_id
       JOIN users u ON u.id = sh.user_id
       WHERE s.tenant_id = $1
         AND sh.starts_at <= NOW() AND sh.ends_at >= NOW()
       ORDER BY s.name`,
      [req.user!.tenantId]
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

export default router;
