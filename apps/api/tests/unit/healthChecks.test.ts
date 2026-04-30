/**
 * /livez and /readyz contract tests.
 *
 * Liveness must NEVER consult external dependencies — failing it
 * triggers a pod restart. Readiness consults DB + Redis and reports
 * per-dep status with a strict timeout.
 */

import express from 'express';
import request from 'supertest';

// Mock the dependency clients before importing the route module.
jest.mock('../../src/config/database', () => ({
  __esModule: true,
  default: { query: jest.fn() },
}));
jest.mock('../../src/config/redis', () => ({
  __esModule: true,
  default: { ping: jest.fn() },
}));

import db from '../../src/config/database';
import redis from '../../src/config/redis';
import healthRoutes from '../../src/modules/health/health.routes';

const mockedDb = db as unknown as { query: jest.Mock };
const mockedRedis = redis as unknown as { ping: jest.Mock };

const buildApp = () => {
  const app = express();
  app.use(healthRoutes);
  return app;
};

describe('Health endpoints', () => {
  beforeEach(() => {
    mockedDb.query.mockReset();
    mockedRedis.ping.mockReset();
  });

  describe('GET /livez', () => {
    it('returns 200 without touching dependencies', async () => {
      const res = await request(buildApp()).get('/livez');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(typeof res.body.uptimeSec).toBe('number');
      expect(mockedDb.query).not.toHaveBeenCalled();
      expect(mockedRedis.ping).not.toHaveBeenCalled();
    });
  });

  describe('GET /readyz', () => {
    it('returns 200 with both deps up', async () => {
      mockedDb.query.mockResolvedValue({ rows: [{ '?column?': 1 }] });
      mockedRedis.ping.mockResolvedValue('PONG');

      const res = await request(buildApp()).get('/readyz');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.dependencies.database.status).toBe('up');
      expect(res.body.dependencies.redis.status).toBe('up');
    });

    it('returns 503 when the database is down', async () => {
      mockedDb.query.mockRejectedValue(new Error('ECONNREFUSED'));
      mockedRedis.ping.mockResolvedValue('PONG');

      const res = await request(buildApp()).get('/readyz');
      expect(res.status).toBe(503);
      expect(res.body.status).toBe('degraded');
      expect(res.body.dependencies.database.status).toBe('down');
      expect(res.body.dependencies.database.error).toMatch(/ECONNREFUSED/);
      expect(res.body.dependencies.redis.status).toBe('up');
    });

    it('returns 503 when redis returns an unexpected reply', async () => {
      mockedDb.query.mockResolvedValue({ rows: [] });
      mockedRedis.ping.mockResolvedValue('NOT-PONG');

      const res = await request(buildApp()).get('/readyz');
      expect(res.status).toBe(503);
      expect(res.body.dependencies.redis.status).toBe('down');
    });
  });
});
