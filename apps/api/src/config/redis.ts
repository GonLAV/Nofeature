import Redis from 'ioredis';
import { env } from './env';
import { logger } from '../utils/logger';

export const redis = new Redis(env.REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    if (times > 3) return null;
    return Math.min(times * 200, 1000);
  },
});

redis.on('error', (err) => {
  logger.warn('Redis connection error:', err.message);
});

redis.on('connect', () => {
  logger.info('Redis connected successfully');
});

export async function connectRedis(): Promise<void> {
  await redis.connect();
}
