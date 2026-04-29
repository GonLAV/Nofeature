import rateLimit from 'express-rate-limit';
import { RateLimiterRedis } from 'rate-limiter-flexible';
import { Request, Response, NextFunction } from 'express';
import redis from '../config/redis';
import { config } from '../config/env';

// General API rate limiter
export const apiLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMIT', message: 'Too many requests, please try again later.' } },
  keyGenerator: (req) => (req.headers['x-forwarded-for'] as string) || req.ip || 'unknown',
});

// Strict auth rate limiter (Redis-backed)
const authLimiterRedis = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: 'auth_limit',
  points: 10,
  duration: 60,
  blockDuration: 300,
});

export const authLimiter = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const key = `${(req.headers['x-forwarded-for'] as string) || req.ip}_${req.body?.email || ''}`;
    await authLimiterRedis.consume(key);
    next();
  } catch {
    res.status(429).json({
      success: false,
      error: { code: 'AUTH_RATE_LIMIT', message: 'Too many auth attempts. Try again in 5 minutes.' },
    });
  }
};
