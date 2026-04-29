import { Router, Request, Response } from 'express';
import { authenticate } from '../../middleware/auth';
import db from '../../config/database';

const router = Router();
router.use(authenticate);

const ALLOWED = ['👍','👎','✅','❤️','🎉','🚀','👀','🔥','😢','😄'];

// GET /comments/:id/reactions — grouped counts + my reactions
router.get('/comments/:id/reactions', async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId;
  const userId = req.user!.userId;
  const { rows } = await db.query(
    `SELECT emoji, user_id, u.name
       FROM comment_reactions r
       JOIN users u ON u.id = r.user_id
      WHERE r.tenant_id = $1 AND r.comment_id = $2`,
    [tenantId, req.params.id]
  );
  const grouped: Record<string, { count: number; users: string[]; mine: boolean }> = {};
  for (const r of rows) {
    if (!grouped[r.emoji]) grouped[r.emoji] = { count: 0, users: [], mine: false };
    grouped[r.emoji].count++;
    grouped[r.emoji].users.push(r.name);
    if (r.user_id === userId) grouped[r.emoji].mine = true;
  }
  return res.json({ success: true, data: grouped });
});

// POST /comments/:id/reactions { emoji } — toggle
router.post('/comments/:id/reactions', async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId;
  const userId = req.user!.userId;
  const emoji = String(req.body?.emoji ?? '');
  if (!ALLOWED.includes(emoji)) {
    return res.status(400).json({ success: false, error: 'invalid emoji' });
  }
  const existing = await db.query(
    `SELECT id FROM comment_reactions
      WHERE tenant_id=$1 AND comment_id=$2 AND user_id=$3 AND emoji=$4`,
    [tenantId, req.params.id, userId, emoji]
  );
  if (existing.rows.length > 0) {
    await db.query(`DELETE FROM comment_reactions WHERE id=$1`, [existing.rows[0].id]);
    return res.json({ success: true, toggled: 'off' });
  }
  await db.query(
    `INSERT INTO comment_reactions (tenant_id, comment_id, user_id, emoji)
       VALUES ($1,$2,$3,$4)`,
    [tenantId, req.params.id, userId, emoji]
  );
  return res.json({ success: true, toggled: 'on' });
});

export default router;
