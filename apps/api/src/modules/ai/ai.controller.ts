import { Request, Response, NextFunction } from 'express';
import { AiService } from './ai.service';

export class AiController {
  constructor(private readonly aiService: AiService) {}

  analyze = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.aiService.analyzeRootCause(req.params.id, req.user!.tenantId);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  };

  postmortem = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.aiService.generatePostmortem(req.params.id, req.user!.tenantId);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  };

  suggestResponders = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.aiService.suggestResponders(req.params.id, req.user!.tenantId);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  };
}
