import { Router } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../../middleware/auth';
import { ValidationError } from '../../utils/errors';
import { DriftService } from './drift.service';
import { driftQuerySchema, tenantDriftQuerySchema } from './drift.schema';

const router = Router();
const service = new DriftService();
router.use(authenticate);

const parseOrThrow = <S extends z.ZodTypeAny>(schema: S, payload: unknown): z.infer<S> => {
  const r = schema.safeParse(payload);
  if (r.success) return r.data;
  const fields: Record<string, string[]> = {};
  for (const issue of r.error.issues) {
    const key = issue.path.join('.') || '_';
    (fields[key] ??= []).push(issue.message);
  }
  throw new ValidationError(fields);
};

router.post(
  '/incidents/:id/drift/sync',
  authorize('member', 'manager', 'admin', 'owner'),
  async (req, res, next) => {
    try {
      const data = await service.sync({
        tenantId:   req.user!.tenantId,
        actorId:    req.user!.userId,
        incidentId: req.params.id,
      });
      res.status(201).json({ success: true, data });
    } catch (e) { next(e); }
  },
);

router.get('/incidents/:id/drift', async (req, res, next) => {
  try {
    const data = await service.list({
      tenantId:   req.user!.tenantId,
      incidentId: req.params.id,
    });
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

router.get('/incidents/:id/drift/stats', async (req, res, next) => {
  try {
    const q = parseOrThrow(driftQuerySchema, req.query);
    const data = await service.stats({
      tenantId:        req.user!.tenantId,
      incidentId:      req.params.id,
      halfLifeMinutes: q.halfLifeMinutes,
    });
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

router.get('/drift/top', async (req, res, next) => {
  try {
    const q = parseOrThrow(tenantDriftQuerySchema, req.query);
    const data = await service.topDrifting({
      tenantId:        req.user!.tenantId,
      halfLifeMinutes: q.halfLifeMinutes,
      limit:           q.limit,
      windowDays:      q.windowDays,
    });
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

export default router;
