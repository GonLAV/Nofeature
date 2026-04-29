import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import db from '../../config/database';
import { authenticate, authorize } from '../../middleware/auth';

const router = Router();
router.use(authenticate);

const DEFAULTS = [
  { code: 'P1', label: 'Critical', color: '#dc2626', sla_minutes: 30,   display_order: 1 },
  { code: 'P2', label: 'High',     color: '#ea580c', sla_minutes: 120,  display_order: 2 },
  { code: 'P3', label: 'Medium',   color: '#ca8a04', sla_minutes: 480,  display_order: 3 },
  { code: 'P4', label: 'Low',      color: '#2563eb', sla_minutes: 1440, display_order: 4 },
];

const sevSchema = z.object({
  code: z.string().min(1).max(20),
  label: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  sla_minutes: z.number().int().min(1).max(100000),
  display_order: z.number().int().optional(),
});

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM severity_definitions WHERE tenant_id = $1 ORDER BY display_order, code`,
      [req.user!.tenantId]
    );
    if (rows.length === 0) {
      return res.json({ success: true, data: DEFAULTS, defaults: true });
    }
    res.json({ success: true, data: rows, defaults: false });
  } catch (err) { next(err); }
});

router.post('/', authorize('owner', 'admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = sevSchema.parse(req.body);
    const { rows } = await db.query(
      `INSERT INTO severity_definitions (tenant_id, code, label, description, color, sla_minutes, display_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (tenant_id, code) DO UPDATE
         SET label = EXCLUDED.label, description = EXCLUDED.description, color = EXCLUDED.color,
             sla_minutes = EXCLUDED.sla_minutes, display_order = EXCLUDED.display_order
       RETURNING *`,
      [req.user!.tenantId, b.code, b.label, b.description ?? null,
       b.color ?? '#6b7280', b.sla_minutes, b.display_order ?? 0]
    );
    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
});

router.delete('/:code', authorize('owner', 'admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await db.query(
      `DELETE FROM severity_definitions WHERE tenant_id = $1 AND code = $2`,
      [req.user!.tenantId, req.params.code]
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

// Seed tenant with defaults
router.post('/seed', authorize('owner', 'admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenantId;
    for (const d of DEFAULTS) {
      await db.query(
        `INSERT INTO severity_definitions (tenant_id, code, label, color, sla_minutes, display_order)
         VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (tenant_id, code) DO NOTHING`,
        [tenantId, d.code, d.label, d.color, d.sla_minutes, d.display_order]
      );
    }
    const { rows } = await db.query(
      `SELECT * FROM severity_definitions WHERE tenant_id = $1 ORDER BY display_order`, [tenantId]
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

export default router;
