import { Request, Response, NextFunction } from 'express';
import { IncidentsService } from './incidents.service';
export declare class IncidentsController {
    private readonly incidentsService;
    constructor(incidentsService: IncidentsService);
    list: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    create: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    getById: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    updateStatus: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    updateCommander: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    getTimeline: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    delete: (req: Request, res: Response, next: NextFunction) => Promise<void>;
}
//# sourceMappingURL=incidents.controller.d.ts.map