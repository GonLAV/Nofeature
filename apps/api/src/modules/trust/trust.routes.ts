import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import { TrustDecayService } from './trust.service';
import type { Audience } from './trust.score';

const router  = Router();
const service = new TrustDecayService();

router.use(authenticate);

const isAudience = (s: string): s is Audience =>
  s === 'customers' || s === 'internal' || s === 'exec';

router.post('/incidents/:id/trust/pulse', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await service.computeAll(req.params.id, req.user!.tenantId);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/incidents/:id/trust', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const latest = await service.getLatestAll(req.params.id, req.user!.tenantId);
    if (latest.length === 3) return res.json({ success: true, data: latest });
    const fresh = await service.computeAll(req.params.id, req.user!.tenantId);
    res.json({ success: true, data: fresh });
  } catch (err) { next(err); }
});

router.get('/incidents/:id/trust/:audience/trajectory', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const aud = req.params.audience;
    if (!isAudience(aud)) return res.status(400).json({ success: false, error: { message: 'Invalid audience' } });
    const limit = Number(req.query.limit) || 30;
    const traj  = await service.getAudienceTrajectory(req.params.id, req.user!.tenantId, aud, limit);
    res.json({ success: true, data: { trajectory: traj, count: traj.length } });
  } catch (err) { next(err); }
});

export default router;
