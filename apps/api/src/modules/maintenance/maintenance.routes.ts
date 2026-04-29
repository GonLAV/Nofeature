import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import db from '../../config/database';
import { authenticate, authorize } from '../../middleware/auth';

const router = Router();
router.use(authenticate);

const windowSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(2000).optional(),
  affected_systems: z.array(z.string()).default([]),
  starts_at: z.string(),
  ends_at: z.string(),
  notify_status_page: z.boolean().optional(),
});

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const upcomingOnly = req.query.upcoming === 'true';
    const sql = `SELECT * FROM maintenance_windows
                 WHERE tenant_id = $1 AND deleted_at IS NULL
                 ${upcomingOnly ? "AND ends_at >= NOW()" : ''}
                 ORDER BY starts_at DESC LIMIT 100`;
    const { rows } = await db.query(sql, [req.user!.tenantId]);
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

router.post('/', authorize('owner', 'admin', 'manager'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = windowSchema.parse(req.body);
    const { rows } = await db.query(
      `INSERT INTO maintenance_windows
         (tenant_id, title, description, affected_systems, starts_at, ends_at, notify_status_page, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.user!.tenantId, b.title, b.description ?? null, b.affected_systems,
       b.starts_at, b.ends_at, b.notify_status_page ?? true, req.user!.userId]
    );
    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
});

router.patch('/:id', authorize('owner', 'admin', 'manager'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status } = req.body as { status?: string };
    if (status && !['scheduled', 'in_progress', 'completed', 'cancelled'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status' });
    }
    const { rows } = await db.query(
      `UPDATE maintenance_windows SET status = COALESCE($1, status), updated_at = NOW()
       WHERE id = $2 AND tenant_id = $3 RETURNING *`,
      [status ?? null, req.params.id, req.user!.tenantId]
    );
    res.json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
});

router.delete('/:id', authorize('owner', 'admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await db.query(
      `UPDATE maintenance_windows SET deleted_at = NOW() WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, req.user!.tenantId]
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

// Currently active maintenance — used to suppress noise
router.get('/active', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { rows } = await db.query(
      `SELECT id, title, affected_systems, starts_at, ends_at FROM maintenance_windows
       WHERE tenant_id = $1 AND deleted_at IS NULL
         AND status IN ('scheduled','in_progress')
         AND starts_at <= NOW() AND ends_at >= NOW()`,
      [req.user!.tenantId]
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

export default router;
