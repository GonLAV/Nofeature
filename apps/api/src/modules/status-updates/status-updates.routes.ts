import { Router, Request, Response } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import db from '../../config/database';

const router = Router();
router.use(authenticate);

const STATUSES = ['investigating', 'identified', 'monitoring', 'resolved', 'update'];

// GET /incidents/:id/status-updates — list newest first
router.get('/incidents/:id/status-updates', async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId;
  const { rows } = await db.query(
    `SELECT su.*, u.name AS posted_by_name, u.email AS posted_by_email
       FROM incident_status_updates su
       JOIN users u ON u.id = su.posted_by
      WHERE su.tenant_id = $1 AND su.incident_id = $2
      ORDER BY su.posted_at DESC`,
    [tenantId, req.params.id]
  );
  return res.json({ success: true, data: rows });
});

// POST /incidents/:id/status-updates { status, body }
router.post(
  '/incidents/:id/status-updates',
  authorize('owner', 'admin', 'manager'),
  async (req: Request, res: Response) => {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.userId;
    const status = String(req.body?.status ?? 'update');
    const body = String(req.body?.body ?? '').trim();
    if (!STATUSES.includes(status)) {
      return res.status(400).json({ success: false, error: 'invalid status' });
    }
    if (!body) {
      return res.status(400).json({ success: false, error: 'body required' });
    }
    const inc = await db.query(
      `SELECT id FROM incidents WHERE id=$1 AND tenant_id=$2 AND deleted_at IS NULL`,
      [req.params.id, tenantId]
    );
    if (inc.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'incident not found' });
    }
    const { rows } = await db.query(
      `INSERT INTO incident_status_updates (tenant_id, incident_id, status, body, posted_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [tenantId, req.params.id, status, body, userId]
    );
    await db.query(
      `INSERT INTO audit_logs (tenant_id, user_id, action, resource, resource_id, metadata)
       VALUES ($1,$2,'status_update.posted','incident',$3,$4)`,
      [tenantId, userId, req.params.id, JSON.stringify({ status, body })]
    );
    return res.status(201).json({ success: true, data: rows[0] });
  }
);

// DELETE /status-updates/:id
router.delete(
  '/status-updates/:id',
  authorize('owner', 'admin', 'manager'),
  async (req: Request, res: Response) => {
    const tenantId = req.user!.tenantId;
    const r = await db.query(
      `DELETE FROM incident_status_updates WHERE id=$1 AND tenant_id=$2`,
      [req.params.id, tenantId]
    );
    if (r.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'not found' });
    }
    return res.json({ success: true });
  }
);

export default router;
