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

router.post('/:id/launch', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const overrides = z.object({
      title: z.string().optional(),
      severity: z.string().optional(),
    }).parse(req.body ?? {});
    const tpl = await db.query(
      `SELECT * FROM incident_templates WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [req.params.id, req.user!.tenantId]
    );
    if (!tpl.rows[0]) return res.status(404).json({ success: false, error: 'Template not found' });
    const t = tpl.rows[0];
    const title = overrides.title || t.default_title || t.name;
    const description = t.default_description || t.description || '';
    const severity = overrides.severity || t.default_severity || 'P3';
    if (!['P1', 'P2', 'P3', 'P4'].includes(severity)) {
      return res.status(400).json({ success: false, error: 'Invalid severity' });
    }
    const ins = await db.query(
      `INSERT INTO incidents (tenant_id, title, description, severity, affected_systems, commander_id)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.user!.tenantId, title, description, severity, t.default_systems ?? [], req.user!.userId]
    );
    await db.query(
      `INSERT INTO audit_logs (tenant_id, user_id, action, resource, resource_id, metadata)
       VALUES ($1,$2,'incident.from_template','incident',$3,$4)`,
      [req.user!.tenantId, req.user!.userId, ins.rows[0].id,
       JSON.stringify({ template_id: t.id, template_name: t.name })]
    );
    res.status(201).json({ success: true, data: ins.rows[0] });
  } catch (err) { next(err); }
});

export default router;
