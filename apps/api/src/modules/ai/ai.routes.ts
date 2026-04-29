import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
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

const chatSchema = z.object({
  message: z.string().min(1).max(2000),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().min(1).max(4000),
  })).max(20).optional(),
});

router.post('/incidents/:id/chat', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { message, history } = chatSchema.parse(req.body);
    const reply = await aiService.chatAboutIncident(
      req.params.id,
      req.user!.tenantId,
      history ?? [],
      message
    );
    res.json({ success: true, data: { reply } });
  } catch (err) { next(err); }
});

router.get('/digest', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await aiService.weeklyDigest(req.user!.tenantId);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

export default router;
