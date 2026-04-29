import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import db from '../../config/database';

const router = Router();
router.use(authenticate);

const RELATIONS = ['related', 'duplicate', 'caused-by', 'blocks'] as const;
type Relation = (typeof RELATIONS)[number];

// GET /incidents/:id/links — list both inbound and outbound links
router.get(
  '/incidents/:id/links',
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
        `SELECT l.id, l.relation, l.created_at, l.created_by,
                CASE WHEN l.src_id = $1 THEN 'outgoing' ELSE 'incoming' END AS direction,
                CASE WHEN l.src_id = $1 THEN l.dst_id ELSE l.src_id END AS other_id,
                i.title AS other_title,
                i.severity AS other_severity,
                i.status AS other_status,
                i.incident_number AS other_number,
                u.name AS created_by_name
         FROM incident_links l
         JOIN incidents i ON i.id = (CASE WHEN l.src_id = $1 THEN l.dst_id ELSE l.src_id END)
         LEFT JOIN users u ON u.id = l.created_by
         WHERE l.tenant_id = $2 AND (l.src_id = $1 OR l.dst_id = $1)
           AND i.deleted_at IS NULL
         ORDER BY l.created_at DESC`,
        [id, tenantId]
      );
      res.json({ success: true, data: r.rows });
    } catch (e) { next(e); }
  }
);

// POST /incidents/:id/links { to_incident_id, relation } — link two incidents
router.post(
  '/incidents/:id/links',
  authorize('owner', 'admin', 'manager'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.user!.tenantId;
      const userId = req.user!.userId;
      const srcId = req.params.id;
      const dstId = String(req.body?.to_incident_id || '');
      const relation = String(req.body?.relation || 'related') as Relation;

      if (!dstId) return res.status(400).json({ success: false, error: 'to_incident_id required' });
      if (srcId === dstId) return res.status(400).json({ success: false, error: 'cannot link to self' });
      if (!RELATIONS.includes(relation)) {
        return res.status(400).json({ success: false, error: 'invalid relation' });
      }

      const both = await db.query(
        `SELECT id FROM incidents WHERE id = ANY($1::uuid[]) AND tenant_id=$2 AND deleted_at IS NULL`,
        [[srcId, dstId], tenantId]
      );
      if (both.rows.length !== 2) {
        return res.status(404).json({ success: false, error: 'incident not found' });
      }

      const ins = await db.query(
        `INSERT INTO incident_links (tenant_id, src_id, dst_id, relation, created_by)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (src_id, dst_id, relation) DO NOTHING
         RETURNING *`,
        [tenantId, srcId, dstId, relation, userId]
      );

      if (ins.rows.length === 0) {
        return res.status(409).json({ success: false, error: 'link already exists' });
      }

      // Timeline + audit on both sides
      try {
        await db.query(
          `INSERT INTO incident_timeline (tenant_id, incident_id, event_type, description, created_by, metadata)
           VALUES ($1,$2,'INCIDENT_LINKED',$3,$4,$5)`,
          [tenantId, srcId, `Linked (${relation}) → ${dstId}`, userId, JSON.stringify({ dst_id: dstId, relation })]
        );
      } catch {}
      try {
        await db.query(
          `INSERT INTO audit_logs (tenant_id, user_id, action, resource, resource_id, metadata)
           VALUES ($1,$2,'incident.linked','incident',$3,$4)`,
          [tenantId, userId, srcId, JSON.stringify({ dst_id: dstId, relation })]
        );
      } catch {}

      res.status(201).json({ success: true, data: ins.rows[0] });
    } catch (e) { next(e); }
  }
);

// DELETE /incidents/:id/links/:linkId — remove a link
router.delete(
  '/incidents/:id/links/:linkId',
  authorize('owner', 'admin', 'manager'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.user!.tenantId;
      const userId = req.user!.userId;
      const { id, linkId } = req.params;

      const r = await db.query(
        `DELETE FROM incident_links
         WHERE id=$1 AND tenant_id=$2 AND (src_id=$3 OR dst_id=$3)
         RETURNING *`,
        [linkId, tenantId, id]
      );
      if (r.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'link not found' });
      }

      try {
        await db.query(
          `INSERT INTO audit_logs (tenant_id, user_id, action, resource, resource_id, metadata)
           VALUES ($1,$2,'incident.unlinked','incident',$3,$4)`,
          [tenantId, userId, id, JSON.stringify(r.rows[0])]
        );
      } catch {}

      res.json({ success: true });
    } catch (e) { next(e); }
  }
);

export default router;
