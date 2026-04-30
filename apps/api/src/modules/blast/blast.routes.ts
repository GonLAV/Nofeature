import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import { BlastForecastService } from './blast.service';

const router = Router();
const service = new BlastForecastService();

router.use(authenticate);

/**
 * POST a fresh forecast for an incident. Idempotent in the sense
 * that it always succeeds; each call appends a new snapshot.
 * Designed to be called by the timeline event hooks and by an
 * optional client polling loop.
 */
router.post('/incidents/:id/blast/forecast', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const f = await service.forecast(req.params.id, req.user!.tenantId);
    res.status(201).json({ success: true, data: f });
  } catch (err) { next(err); }
});

/** Read the most-recent forecast snapshot, computing one if missing. */
router.get('/incidents/:id/blast', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const latest = await service.getLatest(req.params.id, req.user!.tenantId);
    if (latest) return res.json({ success: true, data: latest });
    const fresh = await service.forecast(req.params.id, req.user!.tenantId);
    res.json({ success: true, data: fresh });
  } catch (err) { next(err); }
});

/** Sparkline data: last N snapshots. */
router.get('/incidents/:id/blast/trajectory', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = Number(req.query.limit) || 30;
    const traj  = await service.getTrajectory(req.params.id, req.user!.tenantId, limit);
    res.json({ success: true, data: { trajectory: traj, count: traj.length } });
  } catch (err) { next(err); }
});

export default router;
