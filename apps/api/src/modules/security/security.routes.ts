import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import db from '../../config/database';
import { authenticate, authorize } from '../../middleware/auth';

const router = Router();
router.use(authenticate);

const cidrRe = /^(?:\d{1,3}\.){3}\d{1,3}(?:\/\d{1,2})?$|^[0-9a-fA-F:]+\/\d{1,3}$/;

const schema = z.object({
  cidr: z.string().regex(cidrRe, 'Must be valid CIDR'),
  description: z.string().max(200).optional(),
});

router.get('/allowlist', authorize('owner', 'admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM ip_allowlist WHERE tenant_id = $1 ORDER BY created_at DESC`,
      [req.user!.tenantId]
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

router.post('/allowlist', authorize('owner', 'admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = schema.parse(req.body);
    const { rows } = await db.query(
      `INSERT INTO ip_allowlist (tenant_id, cidr, description, created_by)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.user!.tenantId, b.cidr, b.description ?? null, req.user!.userId]
    );
    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
});

router.delete('/allowlist/:id', authorize('owner', 'admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await db.query(`DELETE FROM ip_allowlist WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, req.user!.tenantId]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ── Tenant settings ──────────────────────────────────────────
const settingsSchema = z.object({
  incident_retention_days: z.number().int().min(7).max(3650).optional(),
  audit_retention_days: z.number().int().min(7).max(3650).optional(),
  ai_chat_retention_days: z.number().int().min(1).max(3650).optional(),
  require_ip_allowlist: z.boolean().optional(),
});

router.get('/settings', authorize('owner', 'admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM tenant_settings WHERE tenant_id = $1`,
      [req.user!.tenantId]
    );
    if (!rows[0]) {
      return res.json({ success: true, data: {
        incident_retention_days: 365, audit_retention_days: 365,
        ai_chat_retention_days: 30, require_ip_allowlist: false,
      } });
    }
    res.json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
});

router.put('/settings', authorize('owner', 'admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = settingsSchema.parse(req.body);
    const { rows } = await db.query(
      `INSERT INTO tenant_settings (tenant_id, incident_retention_days, audit_retention_days, ai_chat_retention_days, require_ip_allowlist)
       VALUES ($1, COALESCE($2,365), COALESCE($3,365), COALESCE($4,30), COALESCE($5,false))
       ON CONFLICT (tenant_id) DO UPDATE SET
         incident_retention_days = COALESCE($2, tenant_settings.incident_retention_days),
         audit_retention_days = COALESCE($3, tenant_settings.audit_retention_days),
         ai_chat_retention_days = COALESCE($4, tenant_settings.ai_chat_retention_days),
         require_ip_allowlist = COALESCE($5, tenant_settings.require_ip_allowlist),
         updated_at = NOW()
       RETURNING *`,
      [req.user!.tenantId,
       b.incident_retention_days ?? null,
       b.audit_retention_days ?? null,
       b.ai_chat_retention_days ?? null,
       b.require_ip_allowlist ?? null]
    );
    res.json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
});

export default router;
