import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import db from '../../config/database';
import { authenticate, authorize } from '../../middleware/auth';

const router = Router();
router.use(authenticate);

const createSchema = z.object({
  name: z.string().min(1).max(100),
  scopes: z.array(z.string()).optional(),
  expires_at: z.string().optional(),
});

router.get('/', authorize('owner', 'admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { rows } = await db.query(
      `SELECT id, name, key_prefix, scopes, last_used_at, expires_at, revoked_at, created_at
       FROM api_keys WHERE tenant_id = $1 ORDER BY created_at DESC`,
      [req.user!.tenantId]
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

router.post('/', authorize('owner', 'admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = createSchema.parse(req.body);
    // Generate full key: iwr_<24 random hex>
    const raw = 'iwr_' + crypto.randomBytes(24).toString('hex');
    const hash = crypto.createHash('sha256').update(raw).digest('hex');
    const prefix = raw.slice(0, 10);

    const { rows } = await db.query(
      `INSERT INTO api_keys (tenant_id, name, key_hash, key_prefix, scopes, expires_at, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id, name, key_prefix, scopes, expires_at, created_at`,
      [req.user!.tenantId, b.name, hash, prefix,
       b.scopes ?? ['incidents:read', 'incidents:write'],
       b.expires_at ?? null, req.user!.userId]
    );
    res.status(201).json({ success: true, data: { ...rows[0], key: raw, warning: 'Store this key now — it will not be shown again.' } });
  } catch (err) { next(err); }
});

router.delete('/:id', authorize('owner', 'admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await db.query(
      `UPDATE api_keys SET revoked_at = NOW() WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, req.user!.tenantId]
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;
