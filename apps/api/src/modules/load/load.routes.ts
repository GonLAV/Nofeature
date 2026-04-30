import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import { LoadService } from './load.service';

const router = Router();
const service = new LoadService();

router.use(authenticate);

/**
 * Roster of live responder load \u2014 powers the "War Room Vitals" panel.
 * Returns every active member sorted by score descending so the
 * commander sees who's drowning first.
 */
router.get('/load/roster', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const roster = await service.getRoster(req.user!.tenantId);
    res.json({ success: true, data: { roster, count: roster.length } });
  } catch (err) { next(err); }
});

/** Force-refresh a single user's load snapshot. */
router.post('/users/:id/load', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const entry = await service.snapshotUser(req.params.id, req.user!.tenantId);
    res.status(201).json({ success: true, data: entry });
  } catch (err) { next(err); }
});

/**
 * Page-safely: given candidate user IDs, return the one with the
 * lowest current load. Body: { candidates: string[] }.
 *
 * The frontend page-button calls this just before calling the actual
 * page-user endpoint, then shows "Page Alex (load 22%)" with the
 * recommendation pre-selected.
 */
router.post('/load/recommend', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const candidates = Array.isArray(req.body?.candidates) ? req.body.candidates : [];
    if (candidates.length === 0) {
      return res.status(400).json({ success: false, error: 'candidates[] required' });
    }
    const pick = await service.recommendFreshest(candidates, req.user!.tenantId);
    res.json({ success: true, data: { recommendation: pick } });
  } catch (err) { next(err); }
});

export default router;
