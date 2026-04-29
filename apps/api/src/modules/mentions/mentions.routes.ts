import { Router, Request, Response } from 'express';
import { authenticate } from '../../middleware/auth';
import db from '../../config/database';

const router = Router();
router.use(authenticate);

// GET /mentions — list my unread mentions
router.get('/mentions', async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId;
  const userId = req.user!.userId;
  const onlyUnread = req.query.unread === 'true';
  const where = ['m.tenant_id = $1', 'm.mentioned_user_id = $2'];
  if (onlyUnread) where.push('m.read_at IS NULL');
  const { rows } = await db.query(
    `SELECT m.id, m.comment_id, m.incident_id, m.read_at, m.created_at,
            i.title AS incident_title, i.severity,
            u.name AS mentioned_by_name,
            c.body AS comment_body
       FROM comment_mentions m
       LEFT JOIN incidents i ON i.id = m.incident_id
       LEFT JOIN users u ON u.id = m.mentioned_by
       LEFT JOIN incident_comments c ON c.id = m.comment_id
      WHERE ${where.join(' AND ')}
      ORDER BY m.created_at DESC
      LIMIT 100`,
    [tenantId, userId]
  );
  res.json({ data: rows });
});

// GET /mentions/count — unread count
router.get('/mentions/count', async (req: Request, res: Response) => {
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS unread FROM comment_mentions
      WHERE tenant_id = $1 AND mentioned_user_id = $2 AND read_at IS NULL`,
    [req.user!.tenantId, req.user!.userId]
  );
  res.json({ data: { unread: rows[0].unread } });
});

// POST /mentions/:id/read — mark single
router.post('/mentions/:id/read', async (req: Request, res: Response) => {
  await db.query(
    `UPDATE comment_mentions SET read_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND mentioned_user_id = $3 AND read_at IS NULL`,
    [req.params.id, req.user!.tenantId, req.user!.userId]
  );
  res.json({ data: { ok: true } });
});

// POST /mentions/read-all
router.post('/mentions/read-all', async (req: Request, res: Response) => {
  await db.query(
    `UPDATE comment_mentions SET read_at = NOW()
       WHERE tenant_id = $1 AND mentioned_user_id = $2 AND read_at IS NULL`,
    [req.user!.tenantId, req.user!.userId]
  );
  res.json({ data: { ok: true } });
});

export default router;
