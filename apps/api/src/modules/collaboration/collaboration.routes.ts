import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import db from '../../config/database';
import { authenticate, authorize } from '../../middleware/auth';

const router = Router();
router.use(authenticate);

// ── Comments on incidents ───────────────────────────────────
router.get('/incidents/:id/comments', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { rows } = await db.query(
      `SELECT c.*, u.name AS user_name, u.email AS user_email
       FROM incident_comments c LEFT JOIN users u ON u.id = c.user_id
       WHERE c.incident_id = $1 AND c.tenant_id = $2
       ORDER BY c.created_at ASC`,
      [req.params.id, req.user!.tenantId]
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

const commentSchema = z.object({
  body: z.string().min(1).max(5000),
  is_internal: z.boolean().optional(),
});

router.post('/incidents/:id/comments', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = commentSchema.parse(req.body);
    // confirm incident belongs to tenant
    const inc = await db.query(`SELECT 1 FROM incidents WHERE id = $1 AND tenant_id = $2`, [req.params.id, req.user!.tenantId]);
    if (!inc.rows[0]) return res.status(404).json({ success: false, error: 'Incident not found' });
    const { rows } = await db.query(
      `INSERT INTO incident_comments (tenant_id, incident_id, user_id, body, is_internal)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.user!.tenantId, req.params.id, req.user!.userId, b.body, b.is_internal ?? true]
    );
    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
});

router.delete('/comments/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Allow delete by author or admin/owner
    const role = req.user!.role;
    const params = role === 'owner' || role === 'admin'
      ? [req.params.id, req.user!.tenantId]
      : [req.params.id, req.user!.tenantId, req.user!.userId];
    const where = role === 'owner' || role === 'admin'
      ? `id = $1 AND tenant_id = $2`
      : `id = $1 AND tenant_id = $2 AND user_id = $3`;
    await db.query(`DELETE FROM incident_comments WHERE ${where}`, params);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ── Tags ────────────────────────────────────────────────────
router.get('/tags', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM tags WHERE tenant_id = $1 ORDER BY name`,
      [req.user!.tenantId]
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

const tagSchema = z.object({
  name: z.string().min(1).max(50),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

router.post('/tags', authorize('owner', 'admin', 'manager'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = tagSchema.parse(req.body);
    const { rows } = await db.query(
      `INSERT INTO tags (tenant_id, name, color) VALUES ($1, $2, $3)
       ON CONFLICT (tenant_id, name) DO UPDATE SET color = EXCLUDED.color
       RETURNING *`,
      [req.user!.tenantId, b.name, b.color ?? '#6b7280']
    );
    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
});

router.delete('/tags/:id', authorize('owner', 'admin', 'manager'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await db.query(`DELETE FROM tags WHERE id = $1 AND tenant_id = $2`, [req.params.id, req.user!.tenantId]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.get('/incidents/:id/tags', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { rows } = await db.query(
      `SELECT t.* FROM tags t
       JOIN incident_tags it ON it.tag_id = t.id
       JOIN incidents i ON i.id = it.incident_id
       WHERE it.incident_id = $1 AND i.tenant_id = $2
       ORDER BY t.name`,
      [req.params.id, req.user!.tenantId]
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

router.put('/incidents/:id/tags', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tagIds = z.array(z.string().uuid()).parse(req.body.tag_ids ?? []);
    // confirm incident belongs to tenant
    const inc = await db.query(`SELECT 1 FROM incidents WHERE id = $1 AND tenant_id = $2`, [req.params.id, req.user!.tenantId]);
    if (!inc.rows[0]) return res.status(404).json({ success: false, error: 'Incident not found' });
    await db.query(`DELETE FROM incident_tags WHERE incident_id = $1`, [req.params.id]);
    if (tagIds.length > 0) {
      const values = tagIds.map((_, i) => `($1, $${i + 2})`).join(', ');
      await db.query(
        `INSERT INTO incident_tags (incident_id, tag_id) VALUES ${values}`,
        [req.params.id, ...tagIds]
      );
    }
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;
