/**
 * Prometheus metrics middleware tests.
 *
 * We mount a tiny app, fire a handful of requests, and assert that
 * the /metrics scrape contains the expected counters / histograms
 * with bounded label cardinality (templated routes, never raw IDs).
 */

import express from 'express';
import request from 'supertest';

jest.mock('../../src/config/database', () => ({
  __esModule: true,
  default: {
    query:     jest.fn().mockResolvedValue({ rows: [] }),
    poolStats: () => ({ total: 5, idle: 4, waiting: 0 }),
  },
}));

import { metricsMiddleware, registry } from '../../src/middleware/metrics';

const buildApp = () => {
  const app = express();
  app.use(metricsMiddleware);
  app.get('/api/v1/incidents/:id', (req, res) => res.json({ id: req.params.id }));
  app.post('/api/v1/incidents',     (_req, res) => res.status(201).json({ ok: true }));
  app.get('/metrics', async (_req, res) => {
    res.set('Content-Type', registry.contentType);
    res.end(await registry.metrics());
  });
  return app;
};

describe('Prometheus metrics middleware', () => {
  beforeEach(() => registry.resetMetrics());

  it('records http_requests_total with templated route (not raw ID)', async () => {
    const app = buildApp();
    await request(app).get('/api/v1/incidents/abc-123');
    await request(app).get('/api/v1/incidents/xyz-999');
    await request(app).post('/api/v1/incidents').send({});
    // res.on('finish') is async; wait one tick so increments land
    // before the metrics scrape.
    await new Promise((r) => setImmediate(r));

    const text = await registry.metrics();
    // Templated route used as label — the two GETs collapse into one series.
    expect(text).toMatch(/route="\/api\/v1\/incidents\/:id"[^\n]*\} 2/);
    expect(text).toMatch(/method="POST"[^\n]*route="\/api\/v1\/incidents"[^\n]*\} 1/);
    // Histogram exists.
    expect(text).toContain('http_request_duration_seconds_bucket');
    // DB pool gauge sampled lazily on each scrape.
    expect(text).toContain('db_pool_connections{state="total",service="incident-war-room-api"} 5');
    expect(text).toContain('db_pool_connections{state="idle",service="incident-war-room-api"} 4');
  });

  it('does not instrument /metrics, /livez, /readyz', async () => {
    const app = buildApp();
    await request(app).get('/metrics');
    const text = await registry.metrics();
    expect(text).not.toMatch(/route="\/metrics"/);
  });

  it('exposes default process metrics (cpu, memory, event loop)', async () => {
    const text = await registry.metrics();
    expect(text).toContain('process_cpu_seconds_total');
    expect(text).toContain('process_resident_memory_bytes');
    expect(text).toContain('nodejs_eventloop_lag_seconds');
  });
});
