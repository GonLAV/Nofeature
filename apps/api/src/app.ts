import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import morgan from 'morgan';

import { config } from './config/env';
import { logger } from './utils/logger';
import db from './config/database';
import redis from './config/redis';
import { errorHandler } from './middleware/errorHandler';
import { notFound } from './middleware/notFound';
import { apiLimiter } from './middleware/rateLimiter';
import { requestContextMiddleware } from './middleware/requestContext';
import { metricsMiddleware, registry as metricsRegistry } from './middleware/metrics';
import { idempotency } from './middleware/idempotency';
import healthRoutes from './modules/health/health.routes';

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
import reactionsRoutes from './modules/reactions/reactions.routes';
import servicesRoutes from './modules/services/services.routes';
import statusUpdatesRoutes from './modules/status-updates/status-updates.routes';
import incidentActionsRoutes from './modules/incidents/incident-actions.routes';
import incidentLinksRoutes from './modules/incidents/incident-links.routes';
import incidentShareRoutes from './modules/incidents/incident-share.routes';
import savedFiltersRoutes from './modules/saved-filters/saved-filters.routes';
import inboxRoutes from './modules/inbox/inbox.routes';
import incidentExtrasRoutes from './modules/incidents/incident-extras.routes';
import genomeRoutes from './modules/genome/genome.routes';
import promiseRoutes from './modules/promises/promise.routes';
import calibrationRoutes from './modules/calibration/calibration.routes';
import doppelgangersRoutes from './modules/doppelgangers/doppelgangers.routes';
import dnaRoutes from './modules/dna/dna.routes';
import incidentExportRoutes from './modules/incidents/incident-export.routes';

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
// Strict origin allow-list. Comma-separated list in CORS_ORIGIN.
// Refuses wildcard "*" when credentials are enabled (OWASP A05).
const corsOrigins = String(config.corsOrigin)
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

if (corsOrigins.includes('*') && config.isProduction) {
  logger.error('Refusing to start: CORS_ORIGIN="*" with credentials in production');
  process.exit(1);
}

app.use(cors({
  origin: (origin, cb) => {
    // Allow same-origin / server-to-server (no Origin header).
    if (!origin) return cb(null, true);
    if (corsOrigins.includes('*') || corsOrigins.includes(origin)) return cb(null, true);
    return cb(new Error(`CORS: origin '${origin}' not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Correlation-ID'],
}));

// ── Body Parsing ────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(compression());

// ── Correlation ID + Request Context (AsyncLocalStorage) ────
// Wraps every request in an ALS scope so every log line emitted
// downstream auto-carries correlationId / userId / tenantId / route.
app.use(requestContextMiddleware);

// ── Request Logging ─────────────────────────────────────────
app.use(morgan('combined', {
  stream: { write: (msg) => logger.http(msg.trim()) },
  skip: (req) => req.url === '/health' || req.url === '/livez' || req.url === '/readyz',
}));

// ── Rate Limiting ───────────────────────────────────────────
app.use('/api/', apiLimiter);

// ── Health / Liveness / Readiness ───────────────────────────
// Mounted at root (no /api/v1 prefix) so probes don't have to
// hard-code an API version.
app.use(healthRoutes);
// ── Prometheus Metrics ───────────────────────────────
// Per-request latency / counter middleware, then a /metrics
// scrape endpoint. Defaults registry already covers process
// CPU / RSS / event-loop lag / GC pauses.
app.use(metricsMiddleware);
app.get('/metrics', async (_req, res) => {
  try {
    res.set('Content-Type', metricsRegistry.contentType);
    res.end(await metricsRegistry.metrics());
  } catch (err) {
    res.status(500).end((err as Error).message);
  }
});
// ── API Routes ──────────────────────────────────────────────
// Idempotency middleware runs only on mutating verbs and is a no-op
// without an `Idempotency-Key` header, so legacy clients are
// unaffected. Mounting at the API root covers all v1 endpoints.
const API = `/api/${config.apiVersion}`;
app.use(API, (req, res, next) =>
  ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) ? idempotency(req, res, next) : next(),
);
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
app.use(`${API}`,              reactionsRoutes);
app.use(`${API}`,              servicesRoutes);
app.use(`${API}`,              statusUpdatesRoutes);
app.use(`${API}`,              incidentActionsRoutes);
app.use(`${API}`,              incidentLinksRoutes);
app.use(`${API}`,              incidentShareRoutes);
app.use(`${API}`,              savedFiltersRoutes);
app.use(`${API}`,              inboxRoutes);
app.use(`${API}/presence`,     presenceRoutes);
app.use(`${API}`,              docsRoutes);
app.use(`${API}`,              incidentExtrasRoutes);
app.use(`${API}`,              genomeRoutes);
app.use(`${API}`,              promiseRoutes);
app.use(`${API}`,              calibrationRoutes);
app.use(`${API}`,              doppelgangersRoutes);
app.use(`${API}`,              dnaRoutes);
app.use(`${API}`,              incidentExportRoutes);

// ── Error Handling ──────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

// ── Process-level safety nets ───────────────────────────────
// One forgotten `await` shouldn't silently kill the process. Log it
// loudly so the platform / pager picks it up. We don't auto-exit on
// `unhandledRejection` (Node 15+ default would) so a single buggy
// route can't take down the whole pod.
process.on('unhandledRejection', (reason) => {
  logger.error('UNHANDLED_REJECTION', {
    reason: reason instanceof Error ? reason.message : String(reason),
    stack:  reason instanceof Error ? reason.stack   : undefined,
  });
});
process.on('uncaughtException', (err) => {
  // Truly broken state — log and let the supervisor restart us.
  logger.error('UNCAUGHT_EXCEPTION', { error: err.message, stack: err.stack });
  // Give the logger a moment to flush, then exit.
  setTimeout(() => process.exit(1), 250).unref();
});

// ── Start Server (with graceful shutdown) ───────────────────
const PORT = config.port;

// Skip listen() under Jest so test imports don't bind a port.
const server =
  config.nodeEnv === 'test'
    ? null
    : app.listen(PORT, () => {
        logger.info(
          `🚀 Incident War Room API running on port ${PORT} [${config.nodeEnv}]`,
        );
      });

/**
 * Graceful shutdown:
 *   1. stop accepting new connections (server.close)
 *   2. drain in-flight requests (default keep-alive timeout window)
 *   3. close DB pool + Redis client
 *   4. exit
 *
 * On a second signal, hard-exit (Kubernetes will SIGKILL after
 * terminationGracePeriodSeconds anyway, but be a good citizen).
 */
let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) {
    logger.warn(`Received ${signal} during shutdown — forcing exit`);
    process.exit(1);
  }
  shuttingDown = true;
  logger.info(`Received ${signal} — starting graceful shutdown`);

  const deadline = setTimeout(() => {
    logger.error('Graceful shutdown timed out — forcing exit');
    process.exit(1);
  }, 15_000).unref();

  try {
    if (server) {
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      );
      logger.info('HTTP server closed');
    }
    // Best-effort dependency teardown. Failures here are logged but
    // don't block exit — we're already shutting down.
    await Promise.allSettled([
      redis.quit().then(() => logger.info('Redis disconnected')),
      db.close().then(() => logger.info('PostgreSQL pool drained')),
    ]);
    clearTimeout(deadline);
    logger.info('Shutdown complete');
    process.exit(0);
  } catch (err) {
    logger.error('Error during shutdown', { error: (err as Error).message });
    process.exit(1);
  }
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT',  () => void shutdown('SIGINT'));

export default app;
