import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import db from '../../config/database';

const router = Router();
router.use(authenticate);

// GET /saved-filters — own + shared
router.get('/saved-filters', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.userId;
    const r = await db.query(
      `SELECT s.id, s.name, s.query, s.is_shared, s.created_at, s.user_id,
              u.name AS owner_name,
              (s.user_id = $2) AS is_owner
       FROM saved_filters s
       LEFT JOIN users u ON u.id = s.user_id
       WHERE s.tenant_id=$1 AND (s.user_id=$2 OR s.is_shared=true)
       ORDER BY s.is_shared DESC, s.name ASC`,
      [tenantId, userId]
    );
    res.json({ success: true, data: r.rows });
  } catch (e) { next(e); }
});

// POST /saved-filters { name, query, is_shared? }
router.post('/saved-filters', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.userId;
    const name = String(req.body?.name || '').trim().slice(0, 80);
    const query = req.body?.query;
    const isShared = !!req.body?.is_shared;

    if (!name) return res.status(400).json({ success: false, error: 'name required' });
    if (!query || typeof query !== 'object') {
      return res.status(400).json({ success: false, error: 'query object required' });
    }

    const r = await db.query(
      `INSERT INTO saved_filters (tenant_id, user_id, name, query, is_shared)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [tenantId, userId, name, JSON.stringify(query), isShared]
    );
    res.status(201).json({ success: true, data: r.rows[0] });
  } catch (e) { next(e); }
});

// PATCH /saved-filters/:id { name?, query?, is_shared? }
router.patch('/saved-filters/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.userId;
    const id = req.params.id;

    const own = await db.query(
      `SELECT * FROM saved_filters WHERE id=$1 AND tenant_id=$2`,
      [id, tenantId]
    );
    if (own.rows.length === 0) return res.status(404).json({ success: false, error: 'not found' });
    if (own.rows[0].user_id !== userId) {
      return res.status(403).json({ success: false, error: 'only owner can edit' });
    }

    const sets: string[] = [];
    const vals: any[] = [];
    let i = 1;
    if (typeof req.body?.name === 'string') {
      sets.push(`name=$${i++}`);
      vals.push(req.body.name.trim().slice(0, 80));
    }
    if (req.body?.query && typeof req.body.query === 'object') {
      sets.push(`query=$${i++}`);
      vals.push(JSON.stringify(req.body.query));
    }
    if (typeof req.body?.is_shared === 'boolean') {
      sets.push(`is_shared=$${i++}`);
      vals.push(req.body.is_shared);
    }
    if (sets.length === 0) return res.json({ success: true, data: own.rows[0] });

    vals.push(id);
    const r = await db.query(
      `UPDATE saved_filters SET ${sets.join(', ')} WHERE id=$${i} RETURNING *`,
      vals
    );
    res.json({ success: true, data: r.rows[0] });
  } catch (e) { next(e); }
});

// DELETE /saved-filters/:id
router.delete('/saved-filters/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.userId;
    const id = req.params.id;

    const r = await db.query(
      `DELETE FROM saved_filters
       WHERE id=$1 AND tenant_id=$2 AND user_id=$3
       RETURNING id`,
      [id, tenantId, userId]
    );
    if (r.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'not found or not owner' });
    }
    res.json({ success: true });
  } catch (e) { next(e); }
});

export default router;
