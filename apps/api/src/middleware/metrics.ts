/**
 * Prometheus metrics.
 *
 * Why
 * ───
 * `/livez` + `/readyz` answer "is the pod up?". Metrics answer
 * "how is the service *behaving*?" — latency p95, error rate,
 * pool saturation, in-flight requests. This is what gets you a
 * green light from any SRE reviewing for production rollout.
 *
 * The defaults registry already covers process CPU, RSS memory,
 * event-loop lag, and GC pauses — i.e. half of an SRE dashboard
 * for free. We add three custom series:
 *
 *   • http_requests_total{method,route,status_code}   counter
 *   • http_request_duration_seconds{method,route,…}   histogram
 *   • db_pool{state}                                  gauge
 *
 * Routes are templated (`/api/v1/incidents/:id`) — never raw
 * paths — so cardinality stays bounded.
 */

import {
  Registry, collectDefaultMetrics, Counter, Histogram, Gauge,
} from 'prom-client';
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import db from '../config/database';

export const registry = new Registry();
registry.setDefaultLabels({ service: 'incident-war-room-api' });
collectDefaultMetrics({ register: registry });

const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'HTTP requests received',
  labelNames: ['method', 'route', 'status_code'] as const,
  registers: [registry],
});

const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'] as const,
  // Buckets tuned for typical REST APIs: 5ms .. 5s.
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [registry],
});

const dbPoolGauge = new Gauge({
  name: 'db_pool_connections',
  help: 'PostgreSQL connection pool state',
  labelNames: ['state'] as const,
  registers: [registry],
  // Sampled lazily on each /metrics scrape.
  collect() {
    const s = db.poolStats();
    this.set({ state: 'total'   }, s.total);
    this.set({ state: 'idle'    }, s.idle);
    this.set({ state: 'waiting' }, s.waiting);
  },
});

/** Best-effort templated route. Falls back to the raw path. */
function routeOf(req: Request): string {
  // `req.route?.path` is set after routing matches. For unmatched
  // requests we collapse to '__unmatched' to keep cardinality finite.
  const r = (req as Request & { route?: { path?: string } }).route?.path;
  if (typeof r === 'string') {
    // baseUrl gives '/api/v1/incidents'; r gives '/:id'. Combine.
    return (req.baseUrl || '') + r;
  }
  return '__unmatched';
}

export const metricsMiddleware: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  // Skip the meta endpoints so the metrics scrape doesn't pollute itself.
  if (req.path === '/metrics' || req.path === '/livez' || req.path === '/readyz') {
    return next();
  }
  const stop = httpRequestDuration.startTimer();
  res.on('finish', () => {
    const labels = {
      method:      req.method,
      route:       routeOf(req),
      status_code: String(res.statusCode),
    };
    stop(labels);
    httpRequestsTotal.inc(labels);
  });
  next();
};

// Re-export for tests that want to assert on counters directly.
export const _internal = { httpRequestsTotal, httpRequestDuration, dbPoolGauge };
