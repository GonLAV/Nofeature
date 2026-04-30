/**
 * Incident Cost Meter — HTTP routes.
 *
 *   GET  /api/v1/incidents/:id/cost   — live $ breakdown + projection
 *   GET  /api/v1/cost-model           — get tenant cost model
 *   PUT  /api/v1/cost-model           — update tenant cost model (admin/owner)
 */

import { Router } from 'express';
import { z } from 'zod';

import { authenticate, authorize } from '../../middleware/auth';
import { asyncHandler } from '../../utils/asyncHandler';
import { validate } from '../../middleware/validate';
import { ok } from '../../utils/response';
import { writeAudit } from '../../utils/audit';
import db from '../../config/database';
import { CostModel } from './cost.compute';
import { computeIncidentCost, loadCostModel, saveCostModel } from './cost.service';

const router = Router();
router.use(authenticate);

router.get(
  '/incidents/:id/cost',
  asyncHandler(async (req, res) => {
    const breakdown = await computeIncidentCost(req.user!.tenantId, req.params.id);
    return ok(res, breakdown);
  }),
);

router.get(
  '/cost-model',
  asyncHandler(async (req, res) => {
    const model = await loadCostModel(req.user!.tenantId);
    return ok(res, model);
  }),
);

const CostModelSchema = z.object({
  currency: z.string().trim().length(3).toUpperCase().default('USD'),
  hourlyRateUsd: z.number().nonnegative().max(10_000),
  slaBreachFlatUsd: z.number().nonnegative().max(1_000_000),
  brandPerMinUsdBySeverity: z.object({
    P1: z.number().nonnegative().max(10_000),
    P2: z.number().nonnegative().max(10_000),
    P3: z.number().nonnegative().max(10_000),
    P4: z.number().nonnegative().max(10_000),
  }),
  minResponders: z.number().int().min(0).max(50),
});

router.put(
  '/cost-model',
  authorize('owner', 'admin'),
  validate(CostModelSchema, 'body'),
  asyncHandler(async (req, res) => {
    const model = req.body as CostModel;
    await saveCostModel(req.user!.tenantId, model);

    await writeAudit(db, {
      tenantId: req.user!.tenantId,
      userId: req.user!.userId,
      action: 'cost_model.updated',
      resource: 'tenant',
      resourceId: req.user!.tenantId,
      ip: req.ip ?? null,
      metadata: {
        hourlyRateUsd: model.hourlyRateUsd,
        slaBreachFlatUsd: model.slaBreachFlatUsd,
        currency: model.currency,
      },
    });

    return ok(res, await loadCostModel(req.user!.tenantId));
  }),
);

export default router;
