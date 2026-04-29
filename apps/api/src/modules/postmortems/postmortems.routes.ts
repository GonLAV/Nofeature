import { Router, Request, Response } from 'express';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/auth';
import db from '../../config/database';

const router = Router();
router.use(authenticate);

// GET /incidents/:id/postmortem
router.get('/incidents/:id/postmortem', async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId;
  const { rows } = await db.query(
    `SELECT p.*, u.name AS author_name
       FROM postmortems p
       LEFT JOIN users u ON u.id = p.author_id
      WHERE p.tenant_id = $1 AND p.incident_id = $2`,
    [tenantId, req.params.id]
  );
  return res.json({ success: true, data: rows[0] ?? null });
});

// POST /incidents/:id/postmortem — create or upsert draft
router.post('/incidents/:id/postmortem', async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId;
  const userId = req.user!.userId;
  const { summary, impact, root_cause, what_went_well, what_went_wrong, timeline, lessons } = req.body ?? {};
  const { rows } = await db.query(
    `INSERT INTO postmortems (tenant_id, incident_id, author_id, summary, impact, root_cause, what_went_well, what_went_wrong, timeline, lessons)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,COALESCE($9,'[]'::jsonb),$10)
       ON CONFLICT (incident_id) DO UPDATE SET
         summary = COALESCE(EXCLUDED.summary, postmortems.summary),
         impact = COALESCE(EXCLUDED.impact, postmortems.impact),
         root_cause = COALESCE(EXCLUDED.root_cause, postmortems.root_cause),
         what_went_well = COALESCE(EXCLUDED.what_went_well, postmortems.what_went_well),
         what_went_wrong = COALESCE(EXCLUDED.what_went_wrong, postmortems.what_went_wrong),
         timeline = COALESCE(EXCLUDED.timeline, postmortems.timeline),
         lessons = COALESCE(EXCLUDED.lessons, postmortems.lessons),
         updated_at = NOW()
       RETURNING *`,
    [tenantId, req.params.id, userId, summary ?? null, impact ?? null, root_cause ?? null,
     what_went_well ?? null, what_went_wrong ?? null, timeline ? JSON.stringify(timeline) : null, lessons ?? null]
  );
  await db.query(
    `INSERT INTO audit_logs (tenant_id, user_id, action, resource, resource_id, metadata)
       VALUES ($1,$2,'postmortem.upsert','postmortem',$3,'{}'::jsonb)`,
    [tenantId, userId, rows[0].id]
  );
  return res.json({ success: true, data: rows[0] });
});

// PATCH /incidents/:id/postmortem/status — draft | review | published
router.patch('/incidents/:id/postmortem/status',
  authorize('owner','admin','manager'),
  async (req: Request, res: Response) => {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.userId;
    const status = String(req.body?.status ?? '').trim();
    if (!['draft','review','published'].includes(status)) {
      return res.status(400).json({ success: false, error: 'invalid status' });
    }
    const publishedClause = status === 'published' ? ', published_at = NOW()' : '';
    const { rows } = await db.query(
      `UPDATE postmortems SET status = $1, updated_at = NOW() ${publishedClause}
         WHERE tenant_id = $2 AND incident_id = $3 RETURNING *`,
      [status, tenantId, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ success: false, error: 'not found' });
    await db.query(
      `INSERT INTO audit_logs (tenant_id, user_id, action, resource, resource_id, metadata)
         VALUES ($1,$2,'postmortem.status','postmortem',$3,$4::jsonb)`,
      [tenantId, userId, rows[0].id, JSON.stringify({ status })]
    );
    return res.json({ success: true, data: rows[0] });
  }
);

// GET /postmortems — list (filter by status)
router.get('/postmortems', async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId;
  const status = req.query.status ? String(req.query.status) : null;
  const params: any[] = [tenantId];
  let where = 'p.tenant_id = $1';
  if (status) { params.push(status); where += ` AND p.status = $${params.length}`; }
  const { rows } = await db.query(
    `SELECT p.id, p.incident_id, p.status, p.summary, p.published_at, p.updated_at,
            i.title AS incident_title, i.severity,
            u.name AS author_name
       FROM postmortems p
       JOIN incidents i ON i.id = p.incident_id
       LEFT JOIN users u ON u.id = p.author_id
      WHERE ${where}
      ORDER BY p.updated_at DESC
      LIMIT 200`,
    params
  );
  return res.json({ success: true, data: rows });
});

export default router;
