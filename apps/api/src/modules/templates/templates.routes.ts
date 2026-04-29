import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import db from '../../config/database';
import { authenticate, authorize } from '../../middleware/auth';

const router = Router();
router.use(authenticate);

const templateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  default_severity: z.string().max(20).optional(),
  default_title: z.string().max(500).optional(),
  default_description: z.string().max(5000).optional(),
  default_systems: z.array(z.string()).default([]),
  checklist: z.array(z.object({
    text: z.string().min(1).max(500),
    done: z.boolean().optional(),
  })).default([]),
});

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM incident_templates
       WHERE tenant_id = $1 AND deleted_at IS NULL ORDER BY name`,
      [req.user!.tenantId]
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

router.post('/', authorize('owner', 'admin', 'manager'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = templateSchema.parse(req.body);
    const { rows } = await db.query(
      `INSERT INTO incident_templates
         (tenant_id, name, description, default_severity, default_title, default_description, default_systems, checklist, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [req.user!.tenantId, b.name, b.description ?? null, b.default_severity ?? null,
       b.default_title ?? null, b.default_description ?? null, b.default_systems,
       JSON.stringify(b.checklist), req.user!.userId]
    );
    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
});

router.delete('/:id', authorize('owner', 'admin', 'manager'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await db.query(
      `UPDATE incident_templates SET deleted_at = NOW() WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, req.user!.tenantId]
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;
