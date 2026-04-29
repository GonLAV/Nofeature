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
import statusRoutes from './modules/status/status.routes';
import runbookRoutes from './modules/runbooks/runbook.routes';
import slaRoutes from './modules/sla/sla.routes';
import auditRoutes from './modules/audit/audit.routes';
import patternsRoutes from './modules/patterns/patterns.routes';
import metricsRoutes from './modules/metrics/metrics.routes';
import integrationsRoutes from './modules/integrations/integrations.routes';
import maintenanceRoutes from './modules/maintenance/maintenance.routes';
import templatesRoutes from './modules/templates/templates.routes';
import severityRoutes from './modules/severity/severity.routes';
import apiKeyRoutes from './modules/apikeys/apikeys.routes';
import securityRoutes from './modules/security/security.routes';
import webhookRoutes from './modules/webhooks/webhooks.routes';
import oncallRoutes from './modules/oncall/oncall.routes';
import collaborationRoutes from './modules/collaboration/collaboration.routes';
import escalationRoutes from './modules/escalations/escalations.routes';
import bulkRoutes from './modules/bulk/bulk.routes';
import presenceRoutes from './modules/presence/presence.routes';
import docsRoutes from './modules/docs/docs.routes';
import searchRoutes from './modules/incidents/incident.search.routes';
import opsRoutes from './modules/ops/ops.routes';
import mentionsRoutes from './modules/mentions/mentions.routes';
import postmortemsRoutes from './modules/postmortems/postmortems.routes';
import watchersRoutes from './modules/watchers/watchers.routes';
import incidentExtrasRoutes from './modules/incidents/incident-extras.routes';

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
app.use(`${API}/public`,    statusRoutes);
app.use(`${API}/runbooks`,  runbookRoutes);
app.use(`${API}/sla`,       slaRoutes);
app.use(`${API}/audit`,     auditRoutes);
app.use(`${API}/patterns`,  patternsRoutes);
app.use(`${API}/metrics`,   metricsRoutes);
app.use(`${API}/integrations`, integrationsRoutes);
app.use(`${API}/maintenance`,  maintenanceRoutes);
app.use(`${API}/templates`,    templatesRoutes);
app.use(`${API}/severity`,     severityRoutes);
app.use(`${API}/api-keys`,     apiKeyRoutes);
app.use(`${API}/security`,     securityRoutes);
app.use(`${API}/webhooks`,     webhookRoutes);
app.use(`${API}/oncall`,       oncallRoutes);
app.use(`${API}/escalations`, escalationRoutes);
app.use(`${API}`,              collaborationRoutes);
app.use(`${API}`,              bulkRoutes);
app.use(`${API}`,              searchRoutes);
app.use(`${API}`,              opsRoutes);
app.use(`${API}`,              mentionsRoutes);
app.use(`${API}`,              postmortemsRoutes);
app.use(`${API}`,              watchersRoutes);
app.use(`${API}/presence`,     presenceRoutes);
app.use(`${API}`,              docsRoutes);
app.use(`${API}`,              incidentExtrasRoutes);

// ── Error Handling ──────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

// ── Start Server ────────────────────────────────────────────
const PORT = config.port;
app.listen(PORT, () => {
  logger.info(`🚀 Incident War Room API running on port ${PORT} [${config.nodeEnv}]`);
});

export default app;
