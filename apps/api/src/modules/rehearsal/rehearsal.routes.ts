import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { NotFoundError, ConflictError } from '../../utils/errors';
import { RehearsalService } from './rehearsal.service';
import db from '../../config/database';

const router = Router();
router.use(authenticate);

const service = new RehearsalService();

const startSchema = z.object({
  difficulty: z.enum(['easy', 'medium', 'hard']).default('medium'),
});

const respondSchema = z.object({
  message: z.string().min(1).max(2000),
});

const concludeSchema = z.object({
  resolution: z.string().min(10).max(2000),
});

// GET /rehearsal/sessions — list sessions for the current user's tenant
router.get('/sessions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status } = req.query;
    const conditions = ['tenant_id = $1', 'deleted_at IS NULL'];
    const values: unknown[] = [req.user!.tenantId];

    if (status) {
      conditions.push(`status = $${values.length + 1}`);
      values.push(status);
    }

    const { rows } = await db.query(
      `SELECT
         rs.id, rs.title, rs.difficulty, rs.status, rs.score,
         rs.scoring_details, rs.started_at, rs.completed_at,
         u.name AS created_by_name,
         (SELECT COUNT(*) FROM rehearsal_messages rm WHERE rm.session_id = rs.id AND rm.role = 'responder') AS turns
       FROM rehearsal_sessions rs
       JOIN users u ON rs.created_by = u.id
       WHERE ${conditions.join(' AND ')}
       ORDER BY rs.started_at DESC
       LIMIT 50`,
      values
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// GET /rehearsal/score — org-level resilience score
router.get('/score', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await service.getResilienceScore(req.user!.tenantId);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

// POST /rehearsal/sessions — start a new drill
router.post('/sessions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { difficulty } = startSchema.parse(req.body);
    const { session, openingMessage } = await service.startSession(
      req.user!.tenantId,
      req.user!.userId,
      difficulty,
    );
    res.status(201).json({ success: true, data: { session, openingMessage } });
  } catch (err) { next(err); }
});

// GET /rehearsal/sessions/:id — session detail + messages
router.get('/sessions/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { rows: sessionRows } = await db.query(
      `SELECT rs.*, u.name AS created_by_name
       FROM rehearsal_sessions rs
       JOIN users u ON rs.created_by = u.id
       WHERE rs.id = $1 AND rs.tenant_id = $2 AND rs.deleted_at IS NULL`,
      [req.params.id, req.user!.tenantId]
    );
    if (!sessionRows[0]) throw new NotFoundError('Rehearsal session not found');

    const { rows: messages } = await db.query(
      `SELECT id, role, content, created_at
       FROM rehearsal_messages
       WHERE session_id = $1
       ORDER BY created_at ASC`,
      [req.params.id]
    );

    // Only expose the scenario's public fields (not the hidden root cause)
    const session = sessionRows[0];
    const scenario = session.scenario ?? {};
    const publicScenario = {
      title: scenario.title,
      affectedService: scenario.affectedService,
      failureType: scenario.failureType,
      // hiddenRootCause is withheld while active
      ...(session.status !== 'active' ? { hiddenRootCause: scenario.hiddenRootCause } : {}),
    };

    res.json({
      success: true,
      data: { ...session, scenario: publicScenario, messages },
    });
  } catch (err) { next(err); }
});

// POST /rehearsal/sessions/:id/respond — submit a diagnostic action
router.post('/sessions/:id/respond', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { message } = respondSchema.parse(req.body);

    // Guard: session must be active and belong to tenant
    const { rows } = await db.query(
      `SELECT status FROM rehearsal_sessions WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [req.params.id, req.user!.tenantId]
    );
    if (!rows[0]) throw new NotFoundError('Session not found');
    if (rows[0].status !== 'active') throw new ConflictError('Session is no longer active');

    const reply = await service.respond(req.params.id, req.user!.tenantId, message);
    res.json({ success: true, data: { reply } });
  } catch (err) { next(err); }
});

// POST /rehearsal/sessions/:id/conclude — end the drill and score it
router.post('/sessions/:id/conclude', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { resolution } = concludeSchema.parse(req.body);
    const result = await service.concludeSession(req.params.id, req.user!.tenantId, resolution);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

// DELETE /rehearsal/sessions/:id — abandon / soft-delete
router.delete('/sessions/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { rowCount } = await db.query(
      `UPDATE rehearsal_sessions
       SET status = 'abandoned', deleted_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [req.params.id, req.user!.tenantId]
    );
    if (!rowCount) throw new NotFoundError('Session not found');
    res.status(204).end();
  } catch (err) { next(err); }
});

export default router;
