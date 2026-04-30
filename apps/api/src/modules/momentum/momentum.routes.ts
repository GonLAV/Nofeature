/**
 * Incident Momentum Index — HTTP routes.
 *
 *   GET  /api/v1/incidents/:id/momentum         — current score (recomputes + persists)
 *   GET  /api/v1/incidents/:id/momentum/history — last N snapshots (default 60)
 */

import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { asyncHandler } from '../../utils/asyncHandler';
import { ok } from '../../utils/response';
import { recomputeMomentum, getMomentumHistory } from './momentum.service';

const router = Router();
router.use(authenticate);

router.get(
  '/incidents/:id/momentum',
  asyncHandler(async (req, res) => {
    const result = await recomputeMomentum(req.user!.tenantId, req.params.id);
    return ok(res, result);
  }),
);

router.get(
  '/incidents/:id/momentum/history',
  asyncHandler(async (req, res) => {
    const limit = Number(req.query.limit ?? 60);
    const history = await getMomentumHistory(
      req.user!.tenantId,
      req.params.id,
      Number.isFinite(limit) ? limit : 60,
    );
    return ok(res, history);
  }),
);

export default router;
