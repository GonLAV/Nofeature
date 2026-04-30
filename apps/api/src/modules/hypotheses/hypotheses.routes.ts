import { Router } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../../middleware/auth';
import { ValidationError } from '../../utils/errors';
import { HypothesesService } from './hypotheses.service';
import {
  createHypothesisSchema,
  settleHypothesisSchema,
  addEvidenceSchema,
  investigationQuerySchema,
} from './hypotheses.schema';

const router = Router();
const service = new HypothesesService();
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

router.get('/incidents/:id/hypotheses', async (req, res, next) => {
  try {
    const data = await service.list(req.user!.tenantId, req.params.id);
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

router.post(
  '/incidents/:id/hypotheses',
  authorize('member', 'manager', 'admin', 'owner'),
  async (req, res, next) => {
    try {
      const body = parseOrThrow(createHypothesisSchema, req.body);
      const data = await service.create({
        tenantId: req.user!.tenantId, actorId: req.user!.userId,
        incidentId: req.params.id, statement: body.statement,
      });
      res.status(201).json({ success: true, data });
    } catch (e) { next(e); }
  },
);

router.patch(
  '/hypotheses/:id/settle',
  authorize('member', 'manager', 'admin', 'owner'),
  async (req, res, next) => {
    try {
      const body = parseOrThrow(settleHypothesisSchema, req.body);
      const data = await service.settle({
        tenantId: req.user!.tenantId, actorId: req.user!.userId,
        hypothesisId: req.params.id, ...body,
      });
      res.json({ success: true, data });
    } catch (e) { next(e); }
  },
);

router.post(
  '/hypotheses/:id/evidence',
  authorize('member', 'manager', 'admin', 'owner'),
  async (req, res, next) => {
    try {
      const body = parseOrThrow(addEvidenceSchema, req.body);
      const data = await service.addEvidence({
        tenantId: req.user!.tenantId, actorId: req.user!.userId,
        hypothesisId: req.params.id, ...body,
      });
      res.status(201).json({ success: true, data });
    } catch (e) { next(e); }
  },
);

router.get('/investigations/stats', async (req, res, next) => {
  try {
    const q = parseOrThrow(investigationQuerySchema, req.query);
    const data = await service.stats({ tenantId: req.user!.tenantId, ...q });
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

export default router;
