import { Request, Response, NextFunction } from 'express';
import { AuthService } from './auth.service';
import { UserRepository } from '../users/user.repository';
import { registerSchema, loginSchema } from './auth.schema';

const authService = new AuthService(new UserRepository());

export const register = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = registerSchema.parse(req.body);
    const result = await authService.register(data);
    res.status(201).json({ success: true, data: result });
  } catch (err) { next(err); }
};

export const login = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const ip = (req.headers['x-forwarded-for'] as string) || req.ip || 'unknown';
    const result = await authService.login(email, password, ip);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

export const refresh = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      res.status(400).json({ success: false, error: { message: 'Refresh token required' } });
      return;
    }
    const tokens = await authService.refreshTokens(refreshToken);
    res.json({ success: true, data: tokens });
  } catch (err) { next(err); }
};

export const logout = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await authService.logout(req.user!.userId);
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (err) { next(err); }
};

export const me = (req: Request, res: Response) => {
  res.json({ success: true, data: { user: req.user } });
};
