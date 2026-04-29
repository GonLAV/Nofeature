import { Router, Request, Response } from 'express';
import { authenticate } from '../../middleware/auth';
import db from '../../config/database';

const router = Router();
router.use(authenticate);

// GET /incidents/:id/watchers — list + my status
router.get('/incidents/:id/watchers', async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId;
  const userId = req.user!.userId;
  const { rows } = await db.query(
    `SELECT w.user_id, u.name, u.email
       FROM incident_watchers w
       JOIN users u ON u.id = w.user_id
      WHERE w.tenant_id = $1 AND w.incident_id = $2
      ORDER BY w.created_at ASC`,
    [tenantId, req.params.id]
  );
  const watching = rows.some(r => r.user_id === userId);
  return res.json({ success: true, data: { watchers: rows, watching, count: rows.length } });
});

// POST /incidents/:id/watch — subscribe self
router.post('/incidents/:id/watch', async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId;
  const userId = req.user!.userId;
  await db.query(
    `INSERT INTO incident_watchers (tenant_id, incident_id, user_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (incident_id, user_id) DO NOTHING`,
    [tenantId, req.params.id, userId]
  );
  return res.json({ success: true });
});

// DELETE /incidents/:id/watch — unsubscribe self
router.delete('/incidents/:id/watch', async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId;
  const userId = req.user!.userId;
  await db.query(
    `DELETE FROM incident_watchers
      WHERE tenant_id = $1 AND incident_id = $2 AND user_id = $3`,
    [tenantId, req.params.id, userId]
  );
  return res.json({ success: true });
});

// GET /watching — my watched incidents (open only)
router.get('/watching', async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId;
  const userId = req.user!.userId;
  const { rows } = await db.query(
    `SELECT i.id, i.title, i.severity, i.status, i.created_at
       FROM incident_watchers w
       JOIN incidents i ON i.id = w.incident_id
      WHERE w.tenant_id = $1 AND w.user_id = $2 AND i.status != 'closed'
      ORDER BY i.created_at DESC`,
    [tenantId, userId]
  );
  return res.json({ success: true, data: rows });
});

export default router;
