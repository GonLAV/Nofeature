import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import morgan from 'morgan';
import { v4 as uuidv4 } from 'uuid';

import { config } from './config/env';
import { logger } from './utils/logger';
import { errorHandler } from './middleware/errorHandler';
import { notFound } from './middleware/notFound';
import { apiLimiter } from './middleware/rateLimiter';

import authRoutes from './modules/auth/auth.routes';
import incidentRoutes from './modules/incidents/incident.routes';
import userRoutes from './modules/users/user.routes';
import tenantRoutes from './modules/tenants/tenant.routes';
import aiRoutes from './modules/ai/ai.routes';
import warRoomRoutes from './modules/warroom/warroom.routes';

const app = express();

// ── Security Headers ────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
    },
  },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
}));

// ── CORS ────────────────────────────────────────────────────
app.use(cors({
  origin: config.corsOrigin,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Correlation-ID'],
}));

// ── Body Parsing ────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(compression());

// ── Correlation ID Middleware ───────────────────────────────
app.use((req, res, next) => {
  const correlationId = (req.headers['x-correlation-id'] as string) || uuidv4();
  req.headers['x-correlation-id'] = correlationId;
  res.setHeader('X-Correlation-ID', correlationId);
  next();
});

// ── Request Logging ─────────────────────────────────────────
app.use(morgan('combined', {
  stream: { write: (msg) => logger.http(msg.trim()) },
  skip: (req) => req.url === '/health',
}));

// ── Rate Limiting ───────────────────────────────────────────
app.use('/api/', apiLimiter);

// ── Health Check ────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), version: config.apiVersion });
});

// ── API Routes ──────────────────────────────────────────────
const API = `/api/${config.apiVersion}`;
app.use(`${API}/auth`,      authRoutes);
app.use(`${API}/incidents`, incidentRoutes);
app.use(`${API}/users`,     userRoutes);
app.use(`${API}/tenants`,   tenantRoutes);
app.use(`${API}/ai`,        aiRoutes);
app.use(`${API}/warroom`,   warRoomRoutes);

// ── Error Handling ──────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

// ── Start Server ────────────────────────────────────────────
const PORT = config.port;
app.listen(PORT, () => {
  logger.info(`🚀 Incident War Room API running on port ${PORT} [${config.nodeEnv}]`);
});

export default app;
