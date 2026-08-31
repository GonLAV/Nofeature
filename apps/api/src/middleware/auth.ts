import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/env';
import { UnauthorizedError, ForbiddenError } from '../utils/errors';

export interface JwtPayload {
  userId: string;
  tenantId: string;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
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

export const authenticate = (req: Request, _res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw new UnauthorizedError('No token provided');

  const token = header.split(' ')[1];
  try {
    const payload = jwt.verify(token, config.jwt.accessSecret) as JwtPayload;

    // Reject tokens for deactivated users without a DB round-trip.
    // Accounts deactivated AFTER token issue are rejected on the next
    // token refresh (15-min window). For immediate revocation use logout.
    if (payload.isActive === false) throw new UnauthorizedError('Account is disabled');

    req.user = payload;
    next();
  } catch (err) {
    if (err instanceof UnauthorizedError) throw err;
    if (err instanceof jwt.TokenExpiredError) throw new UnauthorizedError('Token expired');
    throw new UnauthorizedError('Invalid token');
  }
};

export const authorize = (...roles: string[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) throw new UnauthorizedError();
    if (!roles.includes(req.user.role)) throw new ForbiddenError('Insufficient permissions');
    next();
  };

export const optionalAuth = (req: Request, _res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next();
  try {
    const token = header.split(' ')[1];
    const payload = jwt.verify(token, config.jwt.accessSecret) as JwtPayload;
    if (payload.isActive !== false) req.user = payload;
  } catch { /* ignore */ }
  next();
};
