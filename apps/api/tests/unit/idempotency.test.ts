/**
 * Idempotency middleware tests.
 *
 * We mock Redis with a tiny in-memory implementation that supports
 * SET NX EX semantics, then drive the middleware through the four
 * branches that matter:
 *   1. No header        \u2192 pass-through, single execution.
 *   2. First request    \u2192 reservation written, response cached.
 *   3. Replay same key  \u2192 cached response returned, handler NOT re-run,
 *                         `Idempotent-Replay: true` set.
 *   4. Same key, diff   \u2192 422 IDEMPOTENCY_KEY_REUSED.
 *   5. In-flight reuse  \u2192 409 REQUEST_IN_PROGRESS.
 *   6. Bad key format   \u2192 400 INVALID_IDEMPOTENCY_KEY.
 *   7. Redis outage     \u2192 fail-open (request still processed).
 */

import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const store = new Map<string, { value: string; expiresAt: number }>();
const redisMock = {
  set: jest.fn(async (key: string, value: string, ..._args: unknown[]) => {
    // Args are typically: 'EX', ttl, 'NX'. We honour NX semantics.
    const nx = _args.includes('NX');
    const now = Date.now();
    const existing = store.get(key);
    if (existing && existing.expiresAt > now) {
      if (nx) return null;
    }
    store.set(key, { value, expiresAt: now + 60_000 });
    return 'OK';
  }),
  get: jest.fn(async (key: string) => {
    const e = store.get(key);
    if (!e || e.expiresAt < Date.now()) return null;
    return e.value;
  }),
  del: jest.fn(async (key: string) => { store.delete(key); return 1; }),
};

jest.mock('../../src/config/redis', () => ({
  __esModule: true,
  default: redisMock,
}));

import { idempotency, _internal as idemInternal } from '../../src/middleware/idempotency';

const fakeAuth = (tenant: string): express.RequestHandler =>
  (req, _res, next) => { (req as Request & { user?: any }).user = { tenantId: tenant, userId: 'u', role: 'admin' }; next(); };

const buildApp = (handler: (req: Request, res: Response, next: NextFunction) => unknown) => {
  const app = express();
  app.use(express.json());
  app.use(fakeAuth('t-1'));
  app.use(idempotency);
  app.post('/widgets', handler as any);
  return app;
};

beforeEach(() => {
  store.clear();
  redisMock.set.mockClear();
  redisMock.get.mockClear();
});

describe('Idempotency middleware', () => {
  it('passes through when no Idempotency-Key header is present', async () => {
    const handler = jest.fn((_req, res) => res.status(201).json({ id: 1 }));
    const app = buildApp(handler);
    const res = await request(app).post('/widgets').send({ a: 1 });
    expect(res.status).toBe(201);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(redisMock.set).not.toHaveBeenCalled();
  });

  it('caches and replays the same response for repeated keys', async () => {
    const handler = jest.fn((_req, res) => res.status(201).json({ id: 'created' }));
    const app = buildApp(handler);

    const first = await request(app)
      .post('/widgets')
      .set('Idempotency-Key', 'key-12345678')
      .send({ a: 1 });
    expect(first.status).toBe(201);
    expect(first.body.id).toBe('created');
    expect(handler).toHaveBeenCalledTimes(1);

    const second = await request(app)
      .post('/widgets')
      .set('Idempotency-Key', 'key-12345678')
      .send({ a: 1 });
    expect(second.status).toBe(201);
    expect(second.body.id).toBe('created');
    expect(second.headers['idempotent-replay']).toBe('true');
    // Crucially: handler NOT invoked again.
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('rejects with 422 when the same key is used with a different body', async () => {
    const handler = jest.fn((_req, res) => res.status(201).json({ id: 1 }));
    const app = buildApp(handler);

    await request(app).post('/widgets').set('Idempotency-Key', 'key-12345678').send({ a: 1 });
    const res = await request(app).post('/widgets').set('Idempotency-Key', 'key-12345678').send({ a: 2 });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  it('returns 400 for malformed keys', async () => {
    const app = buildApp((_req, res) => res.status(201).json({}));
    const res = await request(app).post('/widgets').set('Idempotency-Key', 'short').send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_IDEMPOTENCY_KEY');
  });

  it('returns 409 when a prior request with the same key is still in flight', async () => {
    const app = buildApp((_req, res) => res.status(201).json({ ok: true }));
    const body = { a: 1 };
    // Pre-seed an in-flight reservation matching the body fingerprint.
    store.set('idem:t-1:POST:/widgets:key-12345678', {
      value: JSON.stringify({
        fingerprint: idemInternal.fingerprint(body),
        status: 0,
        body: null,
      }),
      expiresAt: Date.now() + 60_000,
    });
    const res = await request(app)
      .post('/widgets')
      .set('Idempotency-Key', 'key-12345678')
      .send(body);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('REQUEST_IN_PROGRESS');
  });

  it('fails open if Redis is unavailable (does not block writes)', async () => {
    redisMock.set.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const handler = jest.fn((_req, res) => res.status(201).json({ ok: true }));
    const app = buildApp(handler);
    const res = await request(app)
      .post('/widgets')
      .set('Idempotency-Key', 'key-12345678')
      .send({ a: 1 });
    expect(res.status).toBe(201);
    expect(handler).toHaveBeenCalled();
  });

  it('does not cache error responses (4xx/5xx) so retries hit a clean slate', async () => {
    const handler = jest.fn((_req, res) => res.status(500).json({ error: 'boom' }));
    const app = buildApp(handler);

    await request(app).post('/widgets').set('Idempotency-Key', 'err-12345678').send({});
    // Slot should have been deleted on failure.
    expect(store.has('idem:t-1:POST:/widgets:err-12345678')).toBe(false);
  });
});
