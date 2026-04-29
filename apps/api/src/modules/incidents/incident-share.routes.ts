import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import db from '../../config/database';

const router = Router();
router.use(authenticate);

// GET /incidents/:id/share-links
router.get(
  '/incidents/:id/share-links',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.user!.tenantId;
      const id = req.params.id;
      const own = await db.query(
        `SELECT id FROM incidents WHERE id=$1 AND tenant_id=$2 AND deleted_at IS NULL`,
        [id, tenantId]
      );
      if (own.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'incident not found' });
      }
      const r = await db.query(
        `SELECT s.id, s.token, s.expires_at, s.revoked_at, s.view_count, s.last_viewed_at, s.created_at,
                u.name AS created_by_name
         FROM incident_share_links s
         LEFT JOIN users u ON u.id = s.created_by
         WHERE s.tenant_id=$1 AND s.incident_id=$2
         ORDER BY s.created_at DESC`,
        [tenantId, id]
      );
      res.json({ success: true, data: r.rows });
    } catch (e) { next(e); }
  }
);

// POST /incidents/:id/share-links { expires_in_hours? }
router.post(
  '/incidents/:id/share-links',
  authorize('owner', 'admin', 'manager'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.user!.tenantId;
      const userId = req.user!.userId;
      const id = req.params.id;
      const hoursRaw = Number(req.body?.expires_in_hours);
      const hours =
        Number.isFinite(hoursRaw) && hoursRaw > 0
          ? Math.min(Math.floor(hoursRaw), 24 * 365)
          : null;

      const own = await db.query(
        `SELECT id FROM incidents WHERE id=$1 AND tenant_id=$2 AND deleted_at IS NULL`,
        [id, tenantId]
      );
      if (own.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'incident not found' });
      }

      const r = await db.query(
        `INSERT INTO incident_share_links (tenant_id, incident_id, created_by, expires_at)
         VALUES ($1,$2,$3, CASE WHEN $4::int IS NULL THEN NULL ELSE NOW() + ($4 || ' hours')::interval END)
         RETURNING *`,
        [tenantId, id, userId, hours]
      );

      try {
        await db.query(
          `INSERT INTO audit_logs (tenant_id, user_id, action, resource, resource_id, metadata)
           VALUES ($1,$2,'incident.share_link_created','incident',$3,$4)`,
          [tenantId, userId, id, JSON.stringify({ token: r.rows[0].token, expires_at: r.rows[0].expires_at })]
        );
      } catch {}

      res.status(201).json({ success: true, data: r.rows[0] });
    } catch (e) { next(e); }
  }
);

// DELETE /incidents/:id/share-links/:linkId — revoke
router.delete(
  '/incidents/:id/share-links/:linkId',
  authorize('owner', 'admin', 'manager'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.user!.tenantId;
      const userId = req.user!.userId;
      const { id, linkId } = req.params;
      const r = await db.query(
        `UPDATE incident_share_links
         SET revoked_at = NOW()
         WHERE id=$1 AND tenant_id=$2 AND incident_id=$3 AND revoked_at IS NULL
         RETURNING *`,
        [linkId, tenantId, id]
      );
      if (r.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'share link not found' });
      }
      try {
        await db.query(
          `INSERT INTO audit_logs (tenant_id, user_id, action, resource, resource_id, metadata)
           VALUES ($1,$2,'incident.share_link_revoked','incident',$3,$4)`,
          [tenantId, userId, id, JSON.stringify({ link_id: linkId })]
        );
      } catch {}
      res.json({ success: true });
    } catch (e) { next(e); }
  }
);

export default router;
