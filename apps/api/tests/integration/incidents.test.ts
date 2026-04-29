import request from 'supertest';
import app from '../../src/app';
import jwt from 'jsonwebtoken';
import { config } from '../../src/config/env';

const makeToken = (overrides = {}) =>
  jwt.sign(
    { userId: 'user-1', tenantId: 'tenant-1', email: 'test@test.com', role: 'admin', ...overrides },
    config.jwt.accessSecret,
    { expiresIn: '15m' }
  );

jest.mock('../../src/config/database', () => ({
  default: { query: jest.fn(), transaction: jest.fn() },
}));

jest.mock('../../src/config/redis', () => ({
  redis: { get: jest.fn(), setex: jest.fn(), del: jest.fn() },
  default: { get: jest.fn(), setex: jest.fn(), del: jest.fn() },
}));

describe('Incidents API', () => {
  it('GET /api/v1/incidents returns 401 without token', async () => {
    const res = await request(app).get('/api/v1/incidents');
    expect(res.status).toBe(401);
  });

  it('POST /api/v1/incidents validates required fields', async () => {
    const res = await request(app)
      .post('/api/v1/incidents')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ title: 'x' }); // too short, missing fields
    expect(res.status).toBe(422);
  });

  it('GET /health returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});
