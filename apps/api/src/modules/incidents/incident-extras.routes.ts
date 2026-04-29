import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import db from '../../config/database';
import { authenticate, authorize } from '../../middleware/auth';

const router = Router();
router.use(authenticate);

// ── Customer impact update ──────────────────────────────────
const impactSchema = z.object({
  customers_affected: z.number().int().min(0).optional(),
  revenue_impact_usd: z.number().min(0).optional(),
});

router.patch('/incidents/:id/impact', authorize('owner', 'admin', 'manager'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = impactSchema.parse(req.body);
    const { rows } = await db.query(
      `UPDATE incidents SET
         customers_affected = COALESCE($1, customers_affected),
         revenue_impact_usd = COALESCE($2, revenue_impact_usd),
         updated_at = NOW()
       WHERE id = $3 AND tenant_id = $4 RETURNING *`,
      [b.customers_affected ?? null, b.revenue_impact_usd ?? null, req.params.id, req.user!.tenantId]
    );
    res.json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
});

router.get('/impact/summary', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const days = Math.min(parseInt(String(req.query.days ?? '30'), 10) || 30, 365);
    const { rows } = await db.query(
      `SELECT
         COALESCE(SUM(customers_affected), 0) AS total_customers_affected,
         COALESCE(SUM(revenue_impact_usd), 0) AS total_revenue_impact,
         COUNT(*) FILTER (WHERE customers_affected > 0) AS incidents_with_impact
       FROM incidents
       WHERE tenant_id = $1 AND deleted_at IS NULL
         AND created_at >= NOW() - ($2 || ' days')::interval`,
      [req.user!.tenantId, days]
    );
    res.json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
});

// ── Linked incidents (parent / child) ───────────────────────
router.patch('/incidents/:id/parent', authorize('owner', 'admin', 'manager'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parent = (req.body.parent_incident_id ?? null) as string | null;
    if (parent === req.params.id) return res.status(400).json({ success: false, error: 'Self-link not allowed' });
    if (parent) {
      const ok = await db.query(`SELECT 1 FROM incidents WHERE id = $1 AND tenant_id = $2`, [parent, req.user!.tenantId]);
      if (!ok.rows[0]) return res.status(400).json({ success: false, error: 'Parent not found' });
    }
    const { rows } = await db.query(
      `UPDATE incidents SET parent_incident_id = $1, updated_at = NOW()
       WHERE id = $2 AND tenant_id = $3 RETURNING parent_incident_id`,
      [parent, req.params.id, req.user!.tenantId]
    );
    res.json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
});

router.get('/incidents/:id/related', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { rows: children } = await db.query(
      `SELECT id, title, severity, status, created_at FROM incidents
       WHERE parent_incident_id = $1 AND tenant_id = $2 AND deleted_at IS NULL
       ORDER BY created_at DESC`,
      [req.params.id, req.user!.tenantId]
    );
    const { rows: parent } = await db.query(
      `SELECT p.id, p.title, p.severity, p.status, p.created_at
       FROM incidents i JOIN incidents p ON p.id = i.parent_incident_id
       WHERE i.id = $1 AND i.tenant_id = $2`,
      [req.params.id, req.user!.tenantId]
    );
    res.json({ success: true, data: { parent: parent[0] ?? null, children } });
  } catch (err) { next(err); }
});

// ── AI similar-incident search (keyword overlap on title) ───
router.get('/incidents/:id/similar', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const inc = await db.query(`SELECT title, severity, affected_systems FROM incidents WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, req.user!.tenantId]);
    if (!inc.rows[0]) return res.status(404).json({ success: false, error: 'Not found' });

    const i = inc.rows[0];
    const tokens = (i.title || '').toLowerCase().split(/\s+/).filter((t: string) => t.length > 3);
    const systems = i.affected_systems || [];

    if (tokens.length === 0 && systems.length === 0) {
      return res.json({ success: true, data: [] });
    }

    const { rows } = await db.query(
      `SELECT id, title, severity, status, created_at, resolved_at, ai_summary,
              (
                CASE WHEN $3::text[] && affected_systems THEN 2 ELSE 0 END +
                CASE WHEN severity = $4 THEN 1 ELSE 0 END +
                (SELECT COUNT(*) FROM unnest($2::text[]) AS t WHERE lower(title) LIKE '%' || t || '%')
              ) AS score
       FROM incidents
       WHERE tenant_id = $1 AND deleted_at IS NULL AND id <> $5
       ORDER BY score DESC, created_at DESC
       LIMIT 8`,
      [req.user!.tenantId, tokens, systems, i.severity, req.params.id]
    );

    res.json({ success: true, data: rows.filter((r) => Number(r.score) > 0) });
  } catch (err) { next(err); }
});

// ── Saved filters ───────────────────────────────────────────
const filterSchema = z.object({
  name: z.string().min(1).max(100),
  query: z.record(z.any()),
  is_shared: z.boolean().optional(),
});

router.get('/saved-filters', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM saved_filters
       WHERE tenant_id = $1 AND (user_id = $2 OR is_shared = true)
       ORDER BY name`,
      [req.user!.tenantId, req.user!.userId]
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

router.post('/saved-filters', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = filterSchema.parse(req.body);
    const { rows } = await db.query(
      `INSERT INTO saved_filters (tenant_id, user_id, name, query, is_shared)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.user!.tenantId, req.user!.userId, b.name, b.query, b.is_shared ?? false]
    );
    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
});

router.delete('/saved-filters/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Only creator can delete
    await db.query(
      `DELETE FROM saved_filters WHERE id = $1 AND tenant_id = $2 AND user_id = $3`,
      [req.params.id, req.user!.tenantId, req.user!.userId]
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;
