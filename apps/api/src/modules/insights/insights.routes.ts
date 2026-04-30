/**
 * Resolution DNA — HTTP routes.
 *
 *   GET  /api/v1/incidents/:id/dna          — full payload (similar + playbook)
 *   POST /api/v1/incidents/:id/dna/feedback — record thumbs up/down on a step
 */

import { Router } from 'express';
import { z } from 'zod';

import { authenticate } from '../../middleware/auth';
import { asyncHandler } from '../../utils/asyncHandler';
import { validate } from '../../middleware/validate';
import { ok } from '../../utils/response';
import { writeAudit } from '../../utils/audit';
import db from '../../config/database';
import { computeDna, recordFeedback } from './insights.service';

const router = Router();
router.use(authenticate);

const FeedbackSchema = z.object({
  step_key: z.string().trim().min(1).max(120),
  signal: z.union([z.literal(1), z.literal(-1)]),
});

router.get(
  '/incidents/:id/dna',
  asyncHandler(async (req, res) => {
    const k = Math.max(1, Math.min(10, Number(req.query.k) || 5));
    const dna = await computeDna(req.user!.tenantId, req.params.id, k);
    return ok(res, dna);
  }),
);

router.post(
  '/incidents/:id/dna/feedback',
  validate(FeedbackSchema, 'body'),
  asyncHandler(async (req, res) => {
    const { step_key, signal } = req.body as z.infer<typeof FeedbackSchema>;

    // Confirm the incident belongs to this tenant before writing feedback.
    const found = await db.query(
      `SELECT 1 FROM incidents WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [req.params.id, req.user!.tenantId],
    );
    if (found.rows.length === 0) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'incident not found' } });
    }

    await recordFeedback(req.user!.tenantId, req.params.id, req.user!.userId, step_key, signal);

    await writeAudit(db, {
      tenantId: req.user!.tenantId,
      userId:   req.user!.userId,
      action:   'dna.feedback',
      resource: 'incident',
      resourceId: req.params.id,
      ip: req.ip ?? null,
      metadata: { step_key, signal },
    });

    return ok(res, { recorded: true });
  }),
);

export default router;
