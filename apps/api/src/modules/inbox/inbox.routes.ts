import { Router, Request, Response } from 'express';
import { authenticate } from '../../middleware/auth';
import db from '../../config/database';

const router = Router();
router.use(authenticate);

// GET /inbox — unified feed: mentions, assignments, watched-incident updates, action items
router.get('/inbox', async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId;
  const userId = req.user!.userId;
  const limit = Math.min(Number(req.query.limit) || 50, 200);

  const items: any[] = [];

  // 1) Mentions
  const mRes = await db.query(
    `SELECT m.id, m.incident_id, m.read_at, m.created_at,
            i.title AS incident_title, i.severity,
            u.name AS actor_name,
            c.body AS comment_body
       FROM comment_mentions m
       LEFT JOIN incidents i ON i.id = m.incident_id
       LEFT JOIN users u ON u.id = m.mentioned_by
       LEFT JOIN incident_comments c ON c.id = m.comment_id
      WHERE m.tenant_id=$1 AND m.mentioned_user_id=$2
      ORDER BY m.created_at DESC LIMIT $3`,
    [tenantId, userId, limit]
  );
  for (const r of mRes.rows) {
    items.push({
      id: `mention:${r.id}`,
      kind: 'mention',
      ref_id: r.id,
      incident_id: r.incident_id,
      incident_title: r.incident_title,
      severity: r.severity,
      actor_name: r.actor_name,
      summary: r.comment_body ? String(r.comment_body).slice(0, 240) : '(comment removed)',
      read: !!r.read_at,
      created_at: r.created_at,
    });
  }

  // 2) Assignments — incidents where I am commander, ordered by latest activity
  const aRes = await db.query(
    `SELECT i.id, i.title, i.severity, i.status, i.updated_at
       FROM incidents i
      WHERE i.tenant_id=$1 AND i.commander_id=$2 AND i.deleted_at IS NULL
        AND i.status IN ('open','investigating','monitoring')
      ORDER BY i.updated_at DESC LIMIT 25`,
    [tenantId, userId]
  );
  for (const r of aRes.rows) {
    items.push({
      id: `assigned:${r.id}`,
      kind: 'assigned',
      incident_id: r.id,
      incident_title: r.title,
      severity: r.severity,
      summary: `You are commander · status: ${r.status}`,
      read: true,
      created_at: r.updated_at,
    });
  }

  // 3) Watched incidents — most recent timeline activity since I started watching
  try {
    const wRes = await db.query(
      `SELECT i.id, i.title, i.severity, i.status, i.updated_at
         FROM incident_watchers w
         JOIN incidents i ON i.id = w.incident_id AND i.deleted_at IS NULL
        WHERE w.tenant_id=$1 AND w.user_id=$2
          AND i.updated_at > COALESCE(w.created_at, NOW() - INTERVAL '30 days')
        ORDER BY i.updated_at DESC LIMIT 25`,
      [tenantId, userId]
    );
    for (const r of wRes.rows) {
      items.push({
        id: `watch:${r.id}`,
        kind: 'watching',
        incident_id: r.id,
        incident_title: r.title,
        severity: r.severity,
        summary: `Watched incident updated · status: ${r.status}`,
        read: true,
        created_at: r.updated_at,
      });
    }
  } catch { /* watchers table may not exist on older schemas */ }

  // 4) Action items assigned to me
  try {
    const tRes = await db.query(
      `SELECT a.id, a.incident_id, a.title, a.status, a.due_date, a.created_at,
              i.title AS incident_title, i.severity
         FROM action_items a
         JOIN incidents i ON i.id = a.incident_id
        WHERE a.tenant_id=$1 AND a.assignee_id=$2 AND a.status NOT IN ('done','cancelled')
        ORDER BY a.created_at DESC LIMIT 25`,
      [tenantId, userId]
    );
    for (const r of tRes.rows) {
      items.push({
        id: `action:${r.id}`,
        kind: 'action',
        ref_id: r.id,
        incident_id: r.incident_id,
        incident_title: r.incident_title,
        severity: r.severity,
        summary: `Action item: ${r.title}` + (r.due_date ? ` · due ${r.due_date}` : ''),
        read: r.status !== 'open',
        created_at: r.created_at,
      });
    }
  } catch { /* table may not exist */ }

  items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const summary = {
    total: items.length,
    unread: items.filter(i => !i.read).length,
    by_kind: items.reduce((acc: Record<string, number>, i) => {
      acc[i.kind] = (acc[i.kind] || 0) + 1; return acc;
    }, {}),
  };

  return res.json({ success: true, data: items.slice(0, limit), summary });
});

// GET /inbox/count
router.get('/inbox/count', async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId;
  const userId = req.user!.userId;

  const m = await db.query(
    `SELECT COUNT(*)::int AS n FROM comment_mentions
      WHERE tenant_id=$1 AND mentioned_user_id=$2 AND read_at IS NULL`,
    [tenantId, userId]
  );
  let actions = 0;
  try {
    const a = await db.query(
      `SELECT COUNT(*)::int AS n FROM action_items
        WHERE tenant_id=$1 AND assignee_id=$2 AND status='open'`,
      [tenantId, userId]
    );
    actions = a.rows[0].n;
  } catch {}

  return res.json({ success: true, data: { mentions: m.rows[0].n, actions, total: m.rows[0].n + actions } });
});

export default router;
