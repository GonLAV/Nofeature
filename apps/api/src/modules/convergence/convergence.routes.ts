import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import { ConvergenceService } from './convergence.service';

const router  = Router();
const service = new ConvergenceService();

router.use(authenticate);

router.post('/incidents/:id/convergence/score', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await service.compute(req.params.id, req.user!.tenantId);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/incidents/:id/convergence', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const latest = await service.getLatest(req.params.id, req.user!.tenantId);
    if (latest) return res.json({ success: true, data: latest });
    const fresh = await service.compute(req.params.id, req.user!.tenantId);
    res.json({ success: true, data: fresh });
  } catch (err) { next(err); }
});

router.get('/incidents/:id/convergence/trajectory', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = Number(req.query.limit) || 30;
    const traj  = await service.getTrajectory(req.params.id, req.user!.tenantId, limit);
    res.json({ success: true, data: { trajectory: traj, count: traj.length } });
  } catch (err) { next(err); }
});

export default router;
