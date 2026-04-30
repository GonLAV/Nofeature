/**
 * Postmortem Promise Ledger \u2014 HTTP routes.
 * Mounted under /api/v1.
 */
import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import { ValidationError } from '../../utils/errors';
import { PromiseService } from './promise.service';
import { GenomeService } from '../genome/genome.service';
import {
  createPromiseSchema,
  updatePromiseSchema,
  resolveSchema,
  listFilterSchema,
} from './promise.schema';

const router = Router();
const service = new PromiseService();
const genome  = new GenomeService();

router.use(authenticate);

// Map a Zod parse to a structured ValidationError.
const parseOrThrow = <T>(schema: { safeParse: (v: unknown) => { success: boolean; data?: T; error?: { issues: Array<{ path: (string | number)[]; message: string }> } } }, payload: unknown): T => {
  const result = schema.safeParse(payload);
  if (!result.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of result.error!.issues) {
      const key = issue.path.length ? String(issue.path[0]) : 'body';
      (fieldErrors[key] ??= []).push(issue.message);
    }
    throw new ValidationError(fieldErrors);
  }
  return result.data!;
};

// ------------------------------------------------------------------ list

router.get('/promises', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const f = parseOrThrow(listFilterSchema, req.query);
    const data = await service.list(req.user!.tenantId, f);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/promises/summary', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const summary = await service.tenantSummary(req.user!.tenantId);
    res.json({ success: true, data: summary });
  } catch (err) { next(err); }
});

router.get('/promises/leaderboard', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await service.ownerLeaderboard(req.user!.tenantId);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/promises/violations', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = Number(req.query.limit) || 25;
    const data = await service.recentViolations(req.user!.tenantId, limit);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/promises/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await service.getById(req.user!.tenantId, req.params.id);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// ------------------------------------------------------------------ writes

router.post(
  '/promises',
  authorize('member', 'manager', 'admin', 'owner'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = parseOrThrow(createPromiseSchema, req.body);
      const created = await service.create({
        tenantId:    req.user!.tenantId,
        actorId:     req.user!.userId,
        incidentId:  body.incidentId,
        title:       body.title,
        detail:      body.detail,
        ownerId:     body.ownerId,
        dueDate:     body.dueDate,
      });
      res.status(201).json({ success: true, data: created });
    } catch (err) { next(err); }
  },
);

router.patch(
  '/promises/:id',
  authorize('member', 'manager', 'admin', 'owner'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = parseOrThrow(updatePromiseSchema, req.body);
      const updated = await service.update({
        tenantId: req.user!.tenantId,
        actorId:  req.user!.userId,
        id:       req.params.id,
        title:    body.title,
        detail:   body.detail,
        ownerId:  body.ownerId,
        dueDate:  body.dueDate,
      });
      res.json({ success: true, data: updated });
    } catch (err) { next(err); }
  },
);

const resolveRoute = (outcome: 'kept' | 'broken' | 'cancelled') =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = parseOrThrow(resolveSchema, req.body ?? {});
      const updated = await service.resolve({
        tenantId:    req.user!.tenantId,
        actorId:     req.user!.userId,
        id:          req.params.id,
        outcome,
        evidenceUrl: body.evidenceUrl,
        reason:      body.reason,
      });
      res.json({ success: true, data: updated });
    } catch (err) { next(err); }
  };

router.post(
  '/promises/:id/keep',
  authorize('member', 'manager', 'admin', 'owner'),
  resolveRoute('kept'),
);
router.post(
  '/promises/:id/break',
  authorize('manager', 'admin', 'owner'),
  resolveRoute('broken'),
);
router.post(
  '/promises/:id/cancel',
  authorize('manager', 'admin', 'owner'),
  resolveRoute('cancelled'),
);

/**
 * Killer feature: detect recurrence.
 *
 * Given a (typically newly-created) incident, find genetically similar
 * past incidents and, for any whose promises were broken, record a
 * recurrence violation. Idempotent thanks to the UNIQUE constraint on
 * (promise_id, recurrence_incident_id).
 */
router.post(
  '/incidents/:id/promises/detect-recurrence',
  authorize('member', 'manager', 'admin', 'owner'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.user!.tenantId;
      const incidentId = req.params.id;
      const limit = Math.min(20, Math.max(1, Number(req.query.limit) || 5));
      const matches = await genome.findMatches(incidentId, tenantId, limit);
      const created = await service.detectRecurrence({
        tenantId,
        incidentId,
        matchIncidentIds: matches.map((m) => m.incidentId),
        costMinutes: Number(req.body?.costMinutes) || 0,
      });
      res.status(201).json({
        success: true,
        data: {
          violations: created,
          matchesConsidered: matches.length,
        },
      });
    } catch (err) { next(err); }
  },
);

export default router;
