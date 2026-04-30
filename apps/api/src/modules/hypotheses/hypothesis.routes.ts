/**
 * Hypothesis Tracker — HTTP routes.
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
  listHypotheses, createHypothesis, castVote, addEvidence, updateStatus,
} from './hypothesis.service';

const router = Router();
router.use(authenticate);

// ─── List hypotheses for an incident ────────────────────────────
router.get(
  '/incidents/:id/hypotheses',
  asyncHandler(async (req, res) => {
    const rows = await listHypotheses(req.user!.tenantId, req.params.id, req.user!.userId);
    return ok(res, rows);
  }),
);

// ─── Create hypothesis ──────────────────────────────────────────
const CreateSchema = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().max(4000).optional().nullable(),
});

router.post(
  '/incidents/:id/hypotheses',
  validate(CreateSchema, 'body'),
  asyncHandler(async (req, res) => {
    const { id } = await createHypothesis(
      req.user!.tenantId,
      req.params.id,
      req.user!.userId,
      req.body.title,
      req.body.description ?? null,
    );

    await writeAudit(db, {
      tenantId: req.user!.tenantId,
      userId: req.user!.userId,
      action: 'hypothesis.created',
      resource: 'hypothesis',
      resourceId: id,
      ip: req.ip ?? null,
      metadata: { incidentId: req.params.id, title: req.body.title },
    });

    return created(res, { id });
  }),
);

// ─── Vote on a hypothesis ──────────────────────────────────────
const VoteSchema = z.object({
  vote: z.union([z.literal(1), z.literal(-1), z.literal(0)]),
});

router.post(
  '/hypotheses/:hid/vote',
  validate(VoteSchema, 'body'),
  asyncHandler(async (req, res) => {
    await castVote(req.user!.tenantId, req.params.hid, req.user!.userId, req.body.vote);
    return ok(res, { ok: true });
  }),
);

// ─── Add evidence ──────────────────────────────────────────────
const EvidenceSchema = z.object({
  stance: z.enum(['supports', 'contradicts', 'context']),
  reference: z.object({
    kind: z.enum(['timeline', 'comment', 'runbook', 'url', 'note']),
    ref: z.string().uuid().optional(),
    url: z.string().url().optional(),
    note: z.string().max(2000).optional(),
  }),
});

router.post(
  '/hypotheses/:hid/evidence',
  validate(EvidenceSchema, 'body'),
  asyncHandler(async (req, res) => {
    const { id } = await addEvidence(
      req.user!.tenantId,
      req.params.hid,
      req.user!.userId,
      req.body.stance,
      req.body.reference,
    );
    return created(res, { id });
  }),
);

// ─── Update status (mark confirmed / refuted / superseded) ─────
const StatusSchema = z.object({
  status: z.enum(['investigating', 'confirmed', 'refuted', 'superseded']),
});

router.patch(
  '/hypotheses/:hid/status',
  validate(StatusSchema, 'body'),
  asyncHandler(async (req, res) => {
    const { incident_id } = await updateStatus(
      req.user!.tenantId, req.params.hid, req.body.status,
    );

    await writeAudit(db, {
      tenantId: req.user!.tenantId,
      userId: req.user!.userId,
      action: `hypothesis.${req.body.status}`,
      resource: 'hypothesis',
      resourceId: req.params.hid,
      ip: req.ip ?? null,
      metadata: { incidentId: incident_id },
    });

    // When a hypothesis is confirmed, drop a timeline marker so the
    // war room sees "Root cause identified: <title>".
    if (req.body.status === 'confirmed') {
      const h = await db.query(
        `SELECT title FROM incident_hypotheses WHERE id = $1`, [req.params.hid],
      );
      const title = (h.rows[0] as { title: string } | undefined)?.title ?? '(untitled)';
      await db.query(
        `INSERT INTO incident_timeline (incident_id, tenant_id, user_id, action, metadata)
         VALUES ($1, $2, $3, 'hypothesis_confirmed', $4)`,
        [
          incident_id,
          req.user!.tenantId,
          req.user!.userId,
          JSON.stringify({ hypothesisId: req.params.hid, title }),
        ],
      );
    }

    return ok(res, { ok: true });
  }),
);

export default router;
