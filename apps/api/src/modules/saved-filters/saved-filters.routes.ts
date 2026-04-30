import { Router } from 'express';
import { z } from 'zod';

import { authenticate } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import { ok, created, fail } from '../../utils/response';
import { NotFoundError, ForbiddenError } from '../../utils/errors';
import db from '../../config/database';

const router = Router();
router.use(authenticate);

// ── Schemas ────────────────────────────────────────────────────
const FilterQuery = z.record(z.unknown());

const CreateFilter = z.object({
  name: z.string().trim().min(1).max(80),
  query: FilterQuery,
  is_shared: z.boolean().optional().default(false),
});

const UpdateFilter = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  query: FilterQuery.optional(),
  is_shared: z.boolean().optional(),
});

// ── GET /saved-filters — own + shared in tenant ────────────────
router.get(
  '/saved-filters',
  asyncHandler(async (req, res) => {
    const { tenantId, userId } = req.user!;
    const { rows } = await db.query(
      `SELECT s.id, s.name, s.query, s.is_shared, s.created_at, s.user_id,
              u.name AS owner_name,
              (s.user_id = $2) AS is_owner
         FROM saved_filters s
         LEFT JOIN users u ON u.id = s.user_id
        WHERE s.tenant_id = $1
          AND (s.user_id = $2 OR s.is_shared = true)
        ORDER BY s.is_shared DESC, s.name ASC`,
      [tenantId, userId]
    );
    return ok(res, rows);
  })
);

// ── POST /saved-filters ────────────────────────────────────────
router.post(
  '/saved-filters',
  validate(CreateFilter),
  asyncHandler(async (req, res) => {
    const { tenantId, userId } = req.user!;
    const { name, query, is_shared } = req.body as z.infer<typeof CreateFilter>;

    const { rows } = await db.query(
      `INSERT INTO saved_filters (tenant_id, user_id, name, query, is_shared)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [tenantId, userId, name, JSON.stringify(query), is_shared]
    );
    return created(res, rows[0]);
  })
);

// ── PATCH /saved-filters/:id — owner only ──────────────────────
router.patch(
  '/saved-filters/:id',
  validate(UpdateFilter),
  asyncHandler(async (req, res) => {
    const { tenantId, userId } = req.user!;
    const { id } = req.params;
    const body = req.body as z.infer<typeof UpdateFilter>;

    const existing = await db.query(
      `SELECT user_id FROM saved_filters WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );
    if (existing.rows.length === 0) throw new NotFoundError('Saved filter');
    if (existing.rows[0].user_id !== userId) {
      throw new ForbiddenError('Only the owner can edit this filter');
    }

    const sets: string[] = [];
    const vals: unknown[] = [];
    let i = 1;
    if (body.name !== undefined)      { sets.push(`name = $${i++}`);      vals.push(body.name); }
    if (body.query !== undefined)     { sets.push(`query = $${i++}`);     vals.push(JSON.stringify(body.query)); }
    if (body.is_shared !== undefined) { sets.push(`is_shared = $${i++}`); vals.push(body.is_shared); }

    if (sets.length === 0) return fail(res, 400, 'NO_FIELDS', 'No fields to update');

    vals.push(id, tenantId);
    const { rows } = await db.query(
      `UPDATE saved_filters
          SET ${sets.join(', ')}
        WHERE id = $${i++} AND tenant_id = $${i}
        RETURNING *`,
      vals
    );
    return ok(res, rows[0]);
  })
);

// ── DELETE /saved-filters/:id — owner only ─────────────────────
router.delete(
  '/saved-filters/:id',
  asyncHandler(async (req, res) => {
    const { tenantId, userId } = req.user!;
    const { id } = req.params;

    const { rows } = await db.query(
      `DELETE FROM saved_filters
        WHERE id = $1 AND tenant_id = $2 AND user_id = $3
        RETURNING id`,
      [id, tenantId, userId]
    );
    if (rows.length === 0) throw new NotFoundError('Saved filter');
    return ok(res, { id: rows[0].id });
  })
);

export default router;
