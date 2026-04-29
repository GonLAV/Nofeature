import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env';
import { generalLimiter } from './middleware/rateLimiter';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { authRouter } from './modules/auth/auth.router';
import { incidentsRouter } from './modules/incidents/incidents.router';
import { aiRouter } from './modules/ai/ai.router';
import { usersRouter } from './modules/users/users.router';
import { tenantsRouter } from './modules/tenants/tenants.router';

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(generalLimiter);

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/incidents', incidentsRouter);
  app.use('/api/v1/ai', aiRouter);
  app.use('/api/v1/users', usersRouter);
  app.use('/api/v1/tenants', tenantsRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
