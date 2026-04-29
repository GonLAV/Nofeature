import { Request, Response, NextFunction } from 'express';
import { AiService } from './ai.service';
export declare class AiController {
    private readonly aiService;
    constructor(aiService: AiService);
    analyze: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    postmortem: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    suggestResponders: (req: Request, res: Response, next: NextFunction) => Promise<void>;
}
//# sourceMappingURL=ai.controller.d.ts.map