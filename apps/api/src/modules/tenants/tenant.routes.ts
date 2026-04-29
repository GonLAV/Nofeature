import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../../middleware/auth';
import db from '../../config/database';
import { v4 as uuidv4 } from 'uuid';
import { ConflictError } from '../../utils/errors';

const router = Router();

const createTenantSchema = z.object({
  name: z.string().min(2).max(100),
  slug: z.string().min(2).max(60).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase letters, numbers, and dashes'),
});

// Public: required for the signup flow (user has no token yet).
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, slug } = createTenantSchema.parse(req.body);
    const existing = await db.query('SELECT id FROM tenants WHERE slug = $1', [slug]);
    if (existing.rows.length) throw new ConflictError('Tenant slug already taken');

    const { rows } = await db.query(
      'INSERT INTO tenants (id, name, slug) VALUES ($1, $2, $3) RETURNING id, name, slug, created_at',
      [uuidv4(), name, slug]
    );
    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
});

// Authenticated routes below
router.use(authenticate);

router.get('/me', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { rows } = await db.query(
      'SELECT id, name, slug, is_active, created_at FROM tenants WHERE id = $1 LIMIT 1',
      [req.user!.tenantId]
    );
    if (rows.length === 0) return res.status(404).json({ success: false, error: 'not found' });
    res.json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
});

router.get('/', authorize('admin', 'owner'), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const { rows } = await db.query('SELECT id, name, slug, created_at FROM tenants ORDER BY created_at DESC');
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

export default router;
