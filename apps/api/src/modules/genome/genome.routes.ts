import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import { GenomeService } from './genome.service';

const router = Router();
const service = new GenomeService();

router.use(authenticate);

/**
 * Recompute (or compute) the genome for an incident.
 * Useful after a major timeline change (status flip, large comment
 * burst). Idempotent.
 */
router.post('/incidents/:id/genome', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const genome = await service.generate(req.params.id, req.user!.tenantId);
    res.status(201).json({ success: true, data: genome });
  } catch (err) { next(err); }
});

/** Read the cached genome (computing on first read). */
router.get('/incidents/:id/genome', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const genome = await service.getOrGenerate(req.params.id, req.user!.tenantId);
    res.json({ success: true, data: genome });
  } catch (err) { next(err); }
});

/**
 * The flagship endpoint: top-K past incidents that match the
 * response shape of this one. Drives the "we've seen this before"
 * UI panel that opens automatically when a P1/P2 is created.
 */
router.get('/incidents/:id/genome/matches', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = Math.min(20, Math.max(1, Number(req.query.limit) || 5));
    const matches = await service.findMatches(req.params.id, req.user!.tenantId, limit);
    res.json({ success: true, data: { matches, count: matches.length } });
  } catch (err) { next(err); }
});

export default router;
