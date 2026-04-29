import { Request, Response, NextFunction } from 'express';
import { UsersService } from './users.service';
export declare class UsersController {
    private readonly usersService;
    constructor(usersService: UsersService);
    list: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    getById: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    updateRole: (req: Request, res: Response, next: NextFunction) => Promise<void>;
    deactivate: (req: Request, res: Response, next: NextFunction) => Promise<void>;
}
//# sourceMappingURL=users.controller.d.ts.map