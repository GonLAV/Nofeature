import { Router } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../../middleware/auth';
import { ValidationError } from '../../utils/errors';
import { ConfidenceService } from './confidence.service';
import {
  recordConfidenceSchema,
  confidenceQuerySchema,
} from './confidence.schema';

const router = Router();
const service = new ConfidenceService();
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
  '/incidents/:id/confidence',
  authorize('member', 'manager', 'admin', 'owner'),
  async (req, res, next) => {
    try {
      const body = parseOrThrow(recordConfidenceSchema, req.body);
      const data = await service.record({
        tenantId:   req.user!.tenantId,
        userId:     req.user!.userId,
        incidentId: req.params.id,
        confidence: body.confidence,
        note:       body.note,
      });
      res.status(201).json({ success: true, data });
    } catch (e) { next(e); }
  },
);

router.get('/incidents/:id/confidence', async (req, res, next) => {
  try {
    const data = await service.list({
      tenantId:   req.user!.tenantId,
      incidentId: req.params.id,
    });
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

router.get('/incidents/:id/confidence/stats', async (req, res, next) => {
  try {
    const q = parseOrThrow(confidenceQuerySchema, req.query);
    const data = await service.stats({
      tenantId:      req.user!.tenantId,
      incidentId:    req.params.id,
      dropThreshold: q.dropThreshold,
    });
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

export default router;
