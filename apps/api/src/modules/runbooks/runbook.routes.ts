import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import db from '../../config/database';
import { authenticate, authorize } from '../../middleware/auth';
import { NotFoundError } from '../../utils/errors';

const router = Router();
router.use(authenticate);

const stepSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  command: z.string().max(500).optional(),
});

const runbookSchema = z.object({
  title: z.string().min(2).max(200),
  description: z.string().max(2000).optional(),
  severity: z.enum(['P1', 'P2', 'P3', 'P4']).optional(),
  tags: z.array(z.string().max(40)).max(20).optional(),
  steps: z.array(stepSchema).min(1).max(50),
});

// GET /runbooks
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { severity, tag } = req.query;
    const conditions = ['tenant_id = $1', 'deleted_at IS NULL'];
    const values: unknown[] = [req.user!.tenantId];
    let i = 2;
    if (severity) { conditions.push(`severity = $${i++}`); values.push(severity); }
    if (tag)      { conditions.push(`$${i++} = ANY(tags)`); values.push(tag); }

    const { rows } = await db.query(
      `SELECT id, title, description, severity, tags, steps, created_at, updated_at
       FROM runbooks WHERE ${conditions.join(' AND ')} ORDER BY updated_at DESC`,
      values
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// GET /runbooks/:id
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM runbooks WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [req.params.id, req.user!.tenantId]
    );
    if (!rows[0]) throw new NotFoundError('Runbook not found');
    res.json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
});

// POST /runbooks
router.post('/', authorize('owner', 'admin', 'manager'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = runbookSchema.parse(req.body);
    const { rows } = await db.query(
      `INSERT INTO runbooks (id, tenant_id, title, description, severity, tags, steps, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [uuidv4(), req.user!.tenantId, data.title, data.description ?? null,
        data.severity ?? null, data.tags ?? [], JSON.stringify(data.steps), req.user!.userId]
    );
    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
});

// PUT /runbooks/:id
router.put('/:id', authorize('owner', 'admin', 'manager'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = runbookSchema.parse(req.body);
    const { rows } = await db.query(
      `UPDATE runbooks SET title=$1, description=$2, severity=$3, tags=$4, steps=$5
       WHERE id=$6 AND tenant_id=$7 AND deleted_at IS NULL RETURNING *`,
      [data.title, data.description ?? null, data.severity ?? null, data.tags ?? [],
        JSON.stringify(data.steps), req.params.id, req.user!.tenantId]
    );
    if (!rows[0]) throw new NotFoundError('Runbook not found');
    res.json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
});

// DELETE /runbooks/:id (soft)
router.delete('/:id', authorize('owner', 'admin', 'manager'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { rowCount } = await db.query(
      `UPDATE runbooks SET deleted_at = NOW() WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [req.params.id, req.user!.tenantId]
    );
    if (!rowCount) throw new NotFoundError('Runbook not found');
    res.status(204).end();
  } catch (err) { next(err); }
});

// GET /runbooks/suggest/:incidentId — match by severity + affected_systems tags
router.get('/suggest/:incidentId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const inc = await db.query(
      `SELECT severity, affected_systems FROM incidents WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [req.params.incidentId, req.user!.tenantId]
    );
    if (!inc.rows[0]) throw new NotFoundError('Incident not found');
    const { severity, affected_systems } = inc.rows[0];

    const { rows } = await db.query(
      `SELECT id, title, description, severity, tags,
              CASE WHEN severity = $2 THEN 2 ELSE 0 END
              + COALESCE(array_length(ARRAY(SELECT UNNEST(tags) INTERSECT SELECT UNNEST($3::text[])), 1), 0) AS score
       FROM runbooks
       WHERE tenant_id = $1 AND deleted_at IS NULL
       ORDER BY score DESC, updated_at DESC LIMIT 5`,
      [req.user!.tenantId, severity, affected_systems ?? []]
    );
    res.json({ success: true, data: rows.filter((r) => Number(r.score) > 0) });
  } catch (err) { next(err); }
});

export default router;
