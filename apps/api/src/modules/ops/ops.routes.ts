import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../../middleware/auth';
import { db } from '../../config/database';

const router = Router();
router.use(authenticate);

const SEVERITIES = ['P1','P2','P3','P4'] as const;

// GET /sla — list SLA targets (auto-create defaults if missing)
router.get('/sla', async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId;
  const { rows } = await db.query(
    'SELECT severity, ack_minutes, resolve_minutes FROM sla_targets WHERE tenant_id = $1',
    [tenantId]
  );
  const map = new Map(rows.map((r: any) => [r.severity, r]));
  const defaults: Record<string, { ack: number; resolve: number }> = {
    P1: { ack: 5,  resolve: 60   },
    P2: { ack: 15, resolve: 240  },
    P3: { ack: 60, resolve: 1440 },
    P4: { ack: 240,resolve: 4320 },
  };
  const out = SEVERITIES.map(s => map.get(s) ?? {
    severity: s, ack_minutes: defaults[s].ack, resolve_minutes: defaults[s].resolve,
  });
  res.json({ data: out });
});

// PUT /sla — upsert all SLA targets (bulk)
const slaSchema = z.object({
  targets: z.array(z.object({
    severity: z.enum(SEVERITIES),
    ack_minutes: z.number().int().min(1).max(100000),
    resolve_minutes: z.number().int().min(1).max(1000000),
  })).min(1).max(4),
});

router.put('/sla', authorize('owner', 'admin'), async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId;
  const body = slaSchema.parse(req.body);
  await db.transaction(async (client) => {
    for (const t of body.targets) {
      await client.query(
        `INSERT INTO sla_targets (tenant_id, severity, ack_minutes, resolve_minutes)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (tenant_id, severity)
         DO UPDATE SET ack_minutes = EXCLUDED.ack_minutes,
                       resolve_minutes = EXCLUDED.resolve_minutes,
                       updated_at = NOW()`,
        [tenantId, t.severity, t.ack_minutes, t.resolve_minutes]
      );
    }
    await client.query(
      `INSERT INTO audit_logs (tenant_id, user_id, action, resource, metadata)
       VALUES ($1,$2,'sla.update','sla',$3)`,
      [tenantId, req.user!.userId, JSON.stringify({ count: body.targets.length })]
    );
  });
  res.json({ data: { ok: true } });
});

// POST /incidents/:id/acknowledge
router.post('/incidents/:id/acknowledge', async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId;
  const userId = req.user!.userId;
  const { id } = req.params;
  const { rows } = await db.query(
    `UPDATE incidents
       SET acknowledged_at = COALESCE(acknowledged_at, NOW()),
           acknowledged_by = COALESCE(acknowledged_by, $3)
     WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
     RETURNING id, acknowledged_at, acknowledged_by`,
    [id, tenantId, userId]
  );
  if (!rows.length) return res.status(404).json({ error: 'Incident not found' });
  res.json({ data: rows[0] });
});

// GET /incidents/:id/sla — compute SLA status for an incident
router.get('/incidents/:id/sla', async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId;
  const { id } = req.params;
  const inc = await db.query(
    `SELECT severity, status, created_at, acknowledged_at, resolved_at
       FROM incidents
      WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
    [id, tenantId]
  );
  if (!inc.rows.length) return res.status(404).json({ error: 'Incident not found' });
  const i = inc.rows[0];
  const target = await db.query(
    'SELECT ack_minutes, resolve_minutes FROM sla_targets WHERE tenant_id = $1 AND severity = $2',
    [tenantId, i.severity]
  );
  const def: Record<string, [number, number]> = { P1: [5, 60], P2: [15, 240], P3: [60, 1440], P4: [240, 4320] };
  const [ackM, resM] = target.rows.length
    ? [target.rows[0].ack_minutes, target.rows[0].resolve_minutes]
    : def[i.severity as keyof typeof def];

  const now = Date.now();
  const created = new Date(i.created_at).getTime();
  const acked = i.acknowledged_at ? new Date(i.acknowledged_at).getTime() : null;
  const resolved = i.resolved_at ? new Date(i.resolved_at).getTime() : null;

  const ackElapsed = ((acked ?? now) - created) / 60000;
  const resElapsed = ((resolved ?? now) - created) / 60000;

  res.json({
    data: {
      severity: i.severity,
      ack_target_minutes: ackM,
      resolve_target_minutes: resM,
      ack_elapsed_minutes: Math.round(ackElapsed),
      resolve_elapsed_minutes: Math.round(resElapsed),
      ack_breached: !acked && ackElapsed > ackM,
      resolve_breached: !resolved && resElapsed > resM,
      ack_met: !!acked && ackElapsed <= ackM,
      resolve_met: !!resolved && resElapsed <= resM,
    },
  });
});

// ── Related incidents ────────────────────────────────────────
const linkSchema = z.object({
  dst_id: z.string().uuid(),
  relation: z.enum(['related', 'duplicate', 'caused-by', 'blocks']).default('related'),
});

router.get('/incidents/:id/links', async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId;
  const { id } = req.params;
  const { rows } = await db.query(
    `SELECT l.id, l.relation, l.created_at,
            CASE WHEN l.src_id = $1 THEN l.dst_id ELSE l.src_id END AS other_id,
            i.title, i.severity, i.status
       FROM incident_links l
       JOIN incidents i ON i.id = CASE WHEN l.src_id = $1 THEN l.dst_id ELSE l.src_id END
      WHERE l.tenant_id = $2 AND (l.src_id = $1 OR l.dst_id = $1)
        AND i.deleted_at IS NULL
      ORDER BY l.created_at DESC`,
    [id, tenantId]
  );
  res.json({ data: rows });
});

router.post('/incidents/:id/links', async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId;
  const userId = req.user!.userId;
  const { id } = req.params;
  const body = linkSchema.parse(req.body);
  if (body.dst_id === id) return res.status(400).json({ error: 'Cannot link to self' });

  // verify both belong to tenant
  const c = await db.query(
    `SELECT COUNT(*)::int AS n FROM incidents
      WHERE tenant_id = $1 AND id = ANY($2::uuid[]) AND deleted_at IS NULL`,
    [tenantId, [id, body.dst_id]]
  );
  if (c.rows[0].n !== 2) return res.status(404).json({ error: 'Incident not found' });

  const { rows } = await db.query(
    `INSERT INTO incident_links (tenant_id, src_id, dst_id, relation, created_by)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (src_id, dst_id, relation) DO NOTHING
     RETURNING id, src_id, dst_id, relation, created_at`,
    [tenantId, id, body.dst_id, body.relation, userId]
  );
  res.status(201).json({ data: rows[0] ?? null });
});

router.delete('/incidents/:id/links/:linkId', async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId;
  const { id, linkId } = req.params;
  await db.query(
    `DELETE FROM incident_links
      WHERE id = $1 AND tenant_id = $2 AND (src_id = $3 OR dst_id = $3)`,
    [linkId, tenantId, id]
  );
  res.status(204).end();
});

// ── Action Items ─────────────────────────────────────────────
const actionSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(5000).optional(),
  assignee_id: z.string().uuid().optional().nullable(),
  due_date: z.string().optional().nullable(),
  status: z.enum(['open', 'in_progress', 'done', 'cancelled']).optional(),
});

router.get('/incidents/:id/actions', async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId;
  const { id } = req.params;
  const { rows } = await db.query(
    `SELECT a.*, u.name AS assignee_name, u.email AS assignee_email
       FROM action_items a
       LEFT JOIN users u ON u.id = a.assignee_id
      WHERE a.incident_id = $1 AND a.tenant_id = $2
      ORDER BY a.created_at DESC`,
    [id, tenantId]
  );
  res.json({ data: rows });
});

router.post('/incidents/:id/actions', async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId;
  const userId = req.user!.userId;
  const { id } = req.params;
  const body = actionSchema.parse(req.body);
  const inc = await db.query(
    'SELECT 1 FROM incidents WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
    [id, tenantId]
  );
  if (!inc.rows.length) return res.status(404).json({ error: 'Incident not found' });

  const { rows } = await db.query(
    `INSERT INTO action_items (tenant_id, incident_id, title, description, assignee_id, due_date, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING *`,
    [tenantId, id, body.title, body.description ?? null, body.assignee_id ?? null, body.due_date ?? null, userId]
  );
  res.status(201).json({ data: rows[0] });
});

router.patch('/actions/:actionId', async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId;
  const { actionId } = req.params;
  const body = actionSchema.partial().parse(req.body);

  const fields: string[] = [];
  const values: any[] = [actionId, tenantId];
  let i = 3;
  for (const [k, v] of Object.entries(body)) {
    if (v === undefined) continue;
    fields.push(`${k} = $${i++}`);
    values.push(v);
  }
  if (body.status === 'done') {
    fields.push(`completed_at = NOW()`);
  } else if (body.status) {
    fields.push(`completed_at = NULL`);
  }
  fields.push('updated_at = NOW()');

  if (!fields.length) return res.status(400).json({ error: 'No fields to update' });
  const { rows } = await db.query(
    `UPDATE action_items SET ${fields.join(', ')}
       WHERE id = $1 AND tenant_id = $2 RETURNING *`,
    values
  );
  if (!rows.length) return res.status(404).json({ error: 'Action item not found' });
  res.json({ data: rows[0] });
});

router.delete('/actions/:actionId', async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId;
  const { actionId } = req.params;
  await db.query('DELETE FROM action_items WHERE id = $1 AND tenant_id = $2', [actionId, tenantId]);
  res.status(204).end();
});

// GET /actions — my open action items
router.get('/actions/mine', async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId;
  const userId = req.user!.userId;
  const { rows } = await db.query(
    `SELECT a.*, i.title AS incident_title, i.severity AS incident_severity
       FROM action_items a
       JOIN incidents i ON i.id = a.incident_id
      WHERE a.tenant_id = $1 AND a.assignee_id = $2 AND a.status IN ('open','in_progress')
      ORDER BY a.due_date NULLS LAST, a.created_at ASC
      LIMIT 100`,
    [tenantId, userId]
  );
  res.json({ data: rows });
});

// ── Saved Searches ───────────────────────────────────────────
const savedSchema = z.object({
  name: z.string().min(1).max(120),
  filters: z.record(z.any()),
});

router.get('/saved-searches', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { rows } = await db.query(
    `SELECT id, name, filters, created_at FROM saved_searches
       WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId]
  );
  res.json({ data: rows });
});

router.post('/saved-searches', async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId;
  const userId = req.user!.userId;
  const body = savedSchema.parse(req.body);
  const { rows } = await db.query(
    `INSERT INTO saved_searches (tenant_id, user_id, name, filters)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (user_id, name) DO UPDATE SET filters = EXCLUDED.filters, created_at = NOW()
     RETURNING id, name, filters, created_at`,
    [tenantId, userId, body.name, JSON.stringify(body.filters)]
  );
  res.status(201).json({ data: rows[0] });
});

router.delete('/saved-searches/:id', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  await db.query('DELETE FROM saved_searches WHERE id = $1 AND user_id = $2', [req.params.id, userId]);
  res.status(204).end();
});

export default router;
