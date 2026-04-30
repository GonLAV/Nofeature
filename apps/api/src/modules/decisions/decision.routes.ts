/**
 * Decision Ledger — HTTP routes.
 */

import { Router } from 'express';
import { z } from 'zod';

import { authenticate } from '../../middleware/auth';
import { asyncHandler } from '../../utils/asyncHandler';
import { validate } from '../../middleware/validate';
import { ok, created } from '../../utils/response';
import { writeAudit } from '../../utils/audit';
import db from '../../config/database';
import {
  listDecisions, createDecision, evaluateDecision, getLeaderboard,
} from './decision.service';

const router = Router();
router.use(authenticate);

// ─── List decisions on an incident ────────────────────────────
router.get(
  '/incidents/:id/decisions',
  asyncHandler(async (req, res) => {
    const rows = await listDecisions(req.user!.tenantId, req.params.id);
    return ok(res, rows);
  }),
);

// ─── Place a bet ──────────────────────────────────────────────
const CreateSchema = z.object({
  action:             z.string().trim().min(3).max(500),
  expected_outcome:   z.string().trim().min(3).max(1000),
  expected_metric:    z.string().trim().max(200).optional().nullable(),
  expected_direction: z.enum(['decrease', 'increase', 'restore', 'none']).optional().nullable(),
  confidence:         z.number().int().min(1).max(100).optional(),
  evaluate_in_minutes: z.number().int().min(1).max(180),
});

router.post(
  '/incidents/:id/decisions',
  validate(CreateSchema, 'body'),
  asyncHandler(async (req, res) => {
    const { id, evaluate_at } = await createDecision(
      req.user!.tenantId, req.params.id, req.user!.userId, req.body,
    );

    await writeAudit(db, {
      tenantId: req.user!.tenantId,
      userId: req.user!.userId,
      action: 'decision.placed',
      resource: 'decision',
      resourceId: id,
      ip: req.ip ?? null,
      metadata: {
        incidentId: req.params.id,
        action: req.body.action,
        confidence: req.body.confidence ?? 70,
      },
    });

    return created(res, { id, evaluate_at });
  }),
);

// ─── Evaluate (did it work?) ──────────────────────────────────
const EvaluateSchema = z.object({
  status: z.enum(['worked', 'failed', 'inconclusive', 'reverted']),
  outcome_note: z.string().trim().max(2000).optional().nullable(),
});

router.patch(
  '/decisions/:did/evaluate',
  validate(EvaluateSchema, 'body'),
  asyncHandler(async (req, res) => {
    const { incident_id, author_id } = await evaluateDecision(
      req.user!.tenantId, req.params.did, req.user!.userId,
      req.body.status, req.body.outcome_note ?? null,
    );

    await writeAudit(db, {
      tenantId: req.user!.tenantId,
      userId: req.user!.userId,
      action: `decision.${req.body.status}`,
      resource: 'decision',
      resourceId: req.params.did,
      ip: req.ip ?? null,
      metadata: { incidentId: incident_id, authorId: author_id },
    });

    return ok(res, { ok: true });
  }),
);

// ─── Per-tenant leaderboard ──────────────────────────────────
router.get(
  '/decisions/leaderboard',
  asyncHandler(async (req, res) => {
    const rows = await getLeaderboard(req.user!.tenantId);
    return ok(res, rows);
  }),
);

export default router;
