import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../../middleware/auth';
import { ValidationError } from '../../utils/errors';
import { DnaService } from './dna.service';
import {
  taxonomyEntrySchema,
  tagFailureModeSchema,
  applyMitigationSchema,
  memoryQuerySchema,
} from './dna.schema';

const router = Router();
const service = new DnaService();
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

// -------- Taxonomy --------

router.get('/dna/failure-modes', async (req, res, next) => {
  try { res.json({ success: true, data: await service.listFailureModes(req.user!.tenantId) }); }
  catch (e) { next(e); }
});

router.post(
  '/dna/failure-modes',
  authorize('manager', 'admin', 'owner'),
  async (req, res, next) => {
    try {
      const body = parseOrThrow(taxonomyEntrySchema, req.body);
      const data = await service.upsertFailureMode({
        tenantId: req.user!.tenantId, actorId: req.user!.userId, ...body,
      });
      res.status(201).json({ success: true, data });
    } catch (e) { next(e); }
  },
);

router.get('/dna/mitigations', async (req, res, next) => {
  try { res.json({ success: true, data: await service.listMitigations(req.user!.tenantId) }); }
  catch (e) { next(e); }
});

router.post(
  '/dna/mitigations',
  authorize('manager', 'admin', 'owner'),
  async (req, res, next) => {
    try {
      const body = parseOrThrow(taxonomyEntrySchema, req.body);
      const data = await service.upsertMitigation({
        tenantId: req.user!.tenantId, actorId: req.user!.userId, ...body,
      });
      res.status(201).json({ success: true, data });
    } catch (e) { next(e); }
  },
);

// -------- Tagging an incident --------

router.get('/incidents/:id/dna', async (req, res, next) => {
  try {
    const [modes, mits] = await Promise.all([
      service.listIncidentFailureModes(req.user!.tenantId, req.params.id),
      service.listIncidentMitigations(req.user!.tenantId, req.params.id),
    ]);
    res.json({ success: true, data: { failureModes: modes, mitigations: mits } });
  } catch (e) { next(e); }
});

router.post(
  '/incidents/:id/dna/failure-modes',
  authorize('member', 'manager', 'admin', 'owner'),
  async (req, res, next) => {
    try {
      const body = parseOrThrow(tagFailureModeSchema, req.body);
      const data = await service.tagFailureMode({
        tenantId: req.user!.tenantId, actorId: req.user!.userId,
        incidentId: req.params.id,
        slug: body.failureModeSlug,
        confidence: body.confidence,
      });
      res.status(201).json({ success: true, data });
    } catch (e) { next(e); }
  },
);

router.delete(
  '/incidents/:id/dna/failure-modes/:slug',
  authorize('member', 'manager', 'admin', 'owner'),
  async (req, res, next) => {
    try {
      await service.untagFailureMode({
        tenantId: req.user!.tenantId, actorId: req.user!.userId,
        incidentId: req.params.id, slug: req.params.slug,
      });
      res.json({ success: true });
    } catch (e) { next(e); }
  },
);

router.post(
  '/incidents/:id/dna/mitigations',
  authorize('member', 'manager', 'admin', 'owner'),
  async (req, res, next) => {
    try {
      const body = parseOrThrow(applyMitigationSchema, req.body);
      const data = await service.applyMitigation({
        tenantId: req.user!.tenantId, actorId: req.user!.userId,
        incidentId: req.params.id,
        slug: body.mitigationSlug,
        effective: body.effective,
        mttrDeltaSeconds: body.mttrDeltaSeconds,
        notes: body.notes,
      });
      res.status(201).json({ success: true, data });
    } catch (e) { next(e); }
  },
);

// -------- Mitigation Memory --------

router.get('/dna/memory', async (req, res, next) => {
  try {
    const q = parseOrThrow(memoryQuerySchema, req.query);
    const data = await service.memoryFor({ tenantId: req.user!.tenantId, ...q });
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

export default router;
