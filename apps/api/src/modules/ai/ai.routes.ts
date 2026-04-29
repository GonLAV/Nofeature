import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import { AIService } from './ai.service';

const router = Router();
const aiService = new AIService();

router.use(authenticate);

router.post('/incidents/:id/analyze', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await aiService.analyzeIncident(req.params.id, req.user!.tenantId);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.get('/incidents/:id/postmortem', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const report = await aiService.generatePostMortem(req.params.id, req.user!.tenantId);
    res.json({ success: true, data: { report } });
  } catch (err) { next(err); }
});

router.get('/incidents/:id/suggest-responders', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const responders = await aiService.suggestResponders(req.params.id, req.user!.tenantId);
    res.json({ success: true, data: { responders } });
  } catch (err) { next(err); }
});

export default router;
