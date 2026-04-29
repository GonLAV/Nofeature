import { Request, Response, NextFunction } from 'express';
export type UserRole = 'owner' | 'admin' | 'manager' | 'member' | 'viewer';
export interface JwtPayload {
    sub: string;
    email: string;
    role: UserRole;
    tenantId: string;
    iat?: number;
    exp?: number;
}
declare global {
    namespace Express {
        interface Request {
            user?: JwtPayload;
        }
    }
}
export declare function authenticate(req: Request, _res: Response, next: NextFunction): void;
export declare function requireRole(...roles: UserRole[]): (req: Request, _res: Response, next: NextFunction) => void;
//# sourceMappingURL=auth.d.ts.map