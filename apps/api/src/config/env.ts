import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV:                z.enum(['development', 'staging', 'production', 'test']).default('development'),
  PORT:                    z.string().default('4000').transform(Number),
  API_VERSION:             z.string().default('v1'),
  DATABASE_URL:            z.string().min(1),
  DATABASE_POOL_MIN:       z.string().default('2').transform(Number),
  DATABASE_POOL_MAX:       z.string().default('10').transform(Number),
  REDIS_URL:               z.string().min(1),
  JWT_ACCESS_SECRET:       z.string().min(32),
  JWT_REFRESH_SECRET:      z.string().min(32),
  JWT_ACCESS_EXPIRES_IN:   z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN:  z.string().default('7d'),
  ANTHROPIC_API_KEY:       z.string().min(1),
  SLACK_BOT_TOKEN:         z.string().optional(),
  SLACK_SIGNING_SECRET:    z.string().optional(),
  SLACK_DEFAULT_CHANNEL:   z.string().default('#incidents'),
  CORS_ORIGIN:             z.string().default('http://localhost:3000'),
  RATE_LIMIT_WINDOW_MS:    z.string().default('60000').transform(Number),
  RATE_LIMIT_MAX_REQUESTS: z.string().default('100').transform(Number),
  ENCRYPTION_KEY:          z.string().min(32),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const env = parsed.data;

export const config = {
  nodeEnv:              env.NODE_ENV,
  port:                 env.PORT,
  apiVersion:           env.API_VERSION,
  isProduction:         env.NODE_ENV === 'production',
  database: {
    url:     env.DATABASE_URL,
    poolMin: env.DATABASE_POOL_MIN,
    poolMax: env.DATABASE_POOL_MAX,
  },
  redis: {
    url: env.REDIS_URL,
  },
  jwt: {
    accessSecret:      env.JWT_ACCESS_SECRET,
    refreshSecret:     env.JWT_REFRESH_SECRET,
    accessExpiresIn:   env.JWT_ACCESS_EXPIRES_IN,
    refreshExpiresIn:  env.JWT_REFRESH_EXPIRES_IN,
  },
  anthropic: {
    apiKey: env.ANTHROPIC_API_KEY,
  },
  slack: {
    botToken:       env.SLACK_BOT_TOKEN,
    signingSecret:  env.SLACK_SIGNING_SECRET,
    defaultChannel: env.SLACK_DEFAULT_CHANNEL,
  },
  corsOrigin:           env.CORS_ORIGIN,
  rateLimit: {
    windowMs:    env.RATE_LIMIT_WINDOW_MS,
    maxRequests: env.RATE_LIMIT_MAX_REQUESTS,
  },
  encryptionKey: env.ENCRYPTION_KEY,
};
