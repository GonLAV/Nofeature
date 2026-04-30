import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../../middleware/auth';
import { ValidationError } from '../../utils/errors';
import { CalibrationService } from './calibration.service';
import {
  createPredictionSchema,
  resolvePredictionSchema,
  listFilterSchema,
  calibrationQuerySchema,
} from './calibration.schema';

const router = Router();
const service = new CalibrationService();

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

router.get('/calibration/predictions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const filter = parseOrThrow(listFilterSchema, req.query);
    const data = await service.list(req.user!.tenantId, filter);
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

router.get('/calibration/report', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = parseOrThrow(calibrationQuerySchema, req.query);
    const data = await service.report({ tenantId: req.user!.tenantId, ...q });
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

router.get('/calibration/leaderboard', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = parseOrThrow(calibrationQuerySchema.pick({ binCount: true, windowDays: true }), req.query);
    const data = await service.leaderboard({ tenantId: req.user!.tenantId, ...q });
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

router.get('/calibration/predictions/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await service.getById(req.user!.tenantId, req.params.id);
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

router.post(
  '/calibration/predictions',
  authorize('member', 'manager', 'admin', 'owner'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = parseOrThrow(createPredictionSchema, req.body);
      const data = await service.create({
        tenantId: req.user!.tenantId,
        actorId:  req.user!.userId,
        ...body,
      });
      res.status(201).json({ success: true, data });
    } catch (e) { next(e); }
  },
);

router.post(
  '/calibration/predictions/:id/resolve',
  authorize('manager', 'admin', 'owner'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = parseOrThrow(resolvePredictionSchema, req.body);
      const data = await service.resolve({
        tenantId: req.user!.tenantId,
        actorId:  req.user!.userId,
        id:       req.params.id,
        ...body,
      });
      res.json({ success: true, data });
    } catch (e) { next(e); }
  },
);

export default router;
