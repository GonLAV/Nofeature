import rateLimit from 'express-rate-limit';
import { RateLimiterRedis } from 'rate-limiter-flexible';
import { Request, Response, NextFunction } from 'express';
import redis from '../config/redis';
import { config } from '../config/env';

// ── General API rate limiter ────────────────────────────────────────────────
export const apiLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: { code: 'RATE_LIMIT', message: 'Too many requests, please try again later.' },
  },
  keyGenerator: (req) =>
    (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() || req.ip || 'unknown',
});

// ── Auth endpoint rate limiter (per IP + email) ─────────────────────────────
// 10 attempts per minute per IP+email combo; blocks for 5 minutes on breach
const authLimiterRedis = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: 'auth_limit',
  points: 10,
  duration: 60,
  blockDuration: 300,
});

export const authLimiter = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ip  = (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() || req.ip || 'unknown';
    const key = `${ip}_${req.body?.email || ''}`;
    await authLimiterRedis.consume(key);
    next();
  } catch {
    res.status(429).json({
      success: false,
      error: { code: 'AUTH_RATE_LIMIT', message: 'Too many auth attempts. Try again in 5 minutes.' },
    });
  }
};

// ── Refresh token rate limiter ──────────────────────────────────────────────
// Separate, lighter limit: 20 refreshes per 15 minutes per IP
const refreshLimiterRedis = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: 'refresh_limit',
  points: 20,
  duration: 900,
  blockDuration: 900,
});

export const refreshLimiter = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() || req.ip || 'unknown';
    await refreshLimiterRedis.consume(ip);
    next();
  } catch {
    res.status(429).json({
      success: false,
      error: { code: 'RATE_LIMIT', message: 'Too many refresh requests. Try again shortly.' },
    });
  }
};
