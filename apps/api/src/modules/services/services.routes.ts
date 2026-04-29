import { Router, Request, Response } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import db from '../../config/database';

const router = Router();
router.use(authenticate);

const STATUSES = ['operational','degraded','partial_outage','major_outage','maintenance'];

// GET /services
router.get('/services', async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId;
  const { rows } = await db.query(
    `SELECT s.*, u.name AS owner_name,
            (SELECT COUNT(*) FROM incident_services isv
               JOIN incidents i ON i.id = isv.incident_id
              WHERE isv.service_id = s.id AND i.status != 'closed') AS active_incidents
       FROM services s
       LEFT JOIN users u ON u.id = s.owner_id
      WHERE s.tenant_id = $1
      ORDER BY s.name ASC`,
    [tenantId]
  );
  return res.json({ success: true, data: rows });
});

// POST /services
router.post('/services', authorize('owner','admin','manager'), async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId;
  const userId = req.user!.userId;
  const { name, description, owner_id } = req.body ?? {};
  if (!name || !String(name).trim()) {
    return res.status(400).json({ success: false, error: 'name required' });
  }
  const { rows } = await db.query(
    `INSERT INTO services (tenant_id, name, description, owner_id)
       VALUES ($1, $2, $3, $4) RETURNING *`,
    [tenantId, String(name).trim(), description ?? null, owner_id ?? null]
  );
  await db.query(
    `INSERT INTO audit_logs (tenant_id, user_id, action, resource, resource_id, metadata)
       VALUES ($1,$2,'service.create','service',$3,'{}'::jsonb)`,
    [tenantId, userId, rows[0].id]
  );
  return res.json({ success: true, data: rows[0] });
});

// PATCH /services/:id — name/description/owner/status
router.patch('/services/:id', authorize('owner','admin','manager'), async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId;
  const userId = req.user!.userId;
  const { name, description, owner_id, status } = req.body ?? {};
  if (status && !STATUSES.includes(status)) {
    return res.status(400).json({ success: false, error: 'invalid status' });
  }
  const { rows } = await db.query(
    `UPDATE services SET
       name = COALESCE($1, name),
       description = COALESCE($2, description),
       owner_id = COALESCE($3, owner_id),
       status = COALESCE($4, status),
       updated_at = NOW()
     WHERE id = $5 AND tenant_id = $6 RETURNING *`,
    [name ?? null, description ?? null, owner_id ?? null, status ?? null, req.params.id, tenantId]
  );
  if (!rows[0]) return res.status(404).json({ success: false, error: 'not found' });
  await db.query(
    `INSERT INTO audit_logs (tenant_id, user_id, action, resource, resource_id, metadata)
       VALUES ($1,$2,'service.update','service',$3,$4::jsonb)`,
    [tenantId, userId, rows[0].id, JSON.stringify(req.body ?? {})]
  );
  return res.json({ success: true, data: rows[0] });
});

// DELETE /services/:id
router.delete('/services/:id', authorize('owner','admin'), async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId;
  const userId = req.user!.userId;
  await db.query(`DELETE FROM services WHERE id=$1 AND tenant_id=$2`, [req.params.id, tenantId]);
  await db.query(
    `INSERT INTO audit_logs (tenant_id, user_id, action, resource, resource_id, metadata)
       VALUES ($1,$2,'service.delete','service',$3,'{}'::jsonb)`,
    [tenantId, userId, req.params.id]
  );
  return res.json({ success: true });
});

// GET /incidents/:id/services
router.get('/incidents/:id/services', async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId;
  const { rows } = await db.query(
    `SELECT s.id, s.name, s.status
       FROM incident_services isv
       JOIN services s ON s.id = isv.service_id
      WHERE isv.tenant_id = $1 AND isv.incident_id = $2
      ORDER BY s.name`,
    [tenantId, req.params.id]
  );
  return res.json({ success: true, data: rows });
});

// POST /incidents/:id/services { service_id }
router.post('/incidents/:id/services', async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId;
  const { service_id } = req.body ?? {};
  if (!service_id) return res.status(400).json({ success: false, error: 'service_id required' });
  await db.query(
    `INSERT INTO incident_services (tenant_id, incident_id, service_id)
       VALUES ($1,$2,$3) ON CONFLICT (incident_id, service_id) DO NOTHING`,
    [tenantId, req.params.id, service_id]
  );
  return res.json({ success: true });
});

// DELETE /incidents/:id/services/:sid
router.delete('/incidents/:id/services/:sid', async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId;
  await db.query(
    `DELETE FROM incident_services
      WHERE tenant_id=$1 AND incident_id=$2 AND service_id=$3`,
    [tenantId, req.params.id, req.params.sid]
  );
  return res.json({ success: true });
});

export default router;
