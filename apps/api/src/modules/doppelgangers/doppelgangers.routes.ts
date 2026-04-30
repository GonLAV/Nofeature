import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { ValidationError } from '../../utils/errors';
import { DoppelgangersService } from './doppelgangers.service';
import {
  searchDoppelgangersSchema,
  incidentDoppelgangersSchema,
} from './doppelgangers.schema';

const router = Router();
const service = new DoppelgangersService();
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

router.post('/doppelgangers/search', async (req, res, next) => {
  try {
    const body = parseOrThrow(searchDoppelgangersSchema, req.body);
    const data = await service.search({
      tenantId: req.user!.tenantId,
      query: body.q,
      tags:  body.tags,
      limit: body.limit,
    });
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

router.get('/incidents/:id/doppelgangers', async (req, res, next) => {
  try {
    const q = parseOrThrow(incidentDoppelgangersSchema, req.query);
    const data = await service.forIncident({
      tenantId: req.user!.tenantId,
      incidentId: req.params.id,
      limit: q.limit,
    });
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

export default router;
