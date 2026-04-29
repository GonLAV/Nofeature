import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { authenticate, authorize, optionalAuth } from '../../src/middleware/auth';
import { errorHandler } from '../../src/middleware/errorHandler';
import { notFound } from '../../src/middleware/notFound';
import { config } from '../../src/config/env';
import { ValidationError, AppError } from '../../src/utils/errors';

function buildApp(handler: express.RequestHandler[]) {
  const app = express();
  app.use(express.json());
  app.get('/test', ...handler, (_req, res) => res.json({ ok: true, user: (_req as express.Request & { user?: unknown }).user }));
  app.use(notFound);
  app.use(errorHandler);
  return app;
}

describe('middleware', () => {
  describe('authenticate', () => {
    it('returns 401 when no token', async () => {
      const res = await request(buildApp([authenticate])).get('/test');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 401 when malformed header', async () => {
      const res = await request(buildApp([authenticate])).get('/test').set('Authorization', 'Token abc');
      expect(res.status).toBe(401);
    });

    it('returns 401 on invalid token', async () => {
      const res = await request(buildApp([authenticate]))
        .get('/test')
        .set('Authorization', 'Bearer not-a-jwt');
      expect(res.status).toBe(401);
    });

    it('returns 401 on expired token', async () => {
      const expired = jwt.sign(
        { userId: 'u', tenantId: 't', email: 'a@b.c', role: 'member' },
        config.jwt.accessSecret,
        { expiresIn: '-1s' }
      );
      const res = await request(buildApp([authenticate])).get('/test').set('Authorization', `Bearer ${expired}`);
      expect(res.status).toBe(401);
      expect(res.body.error.message).toMatch(/expired/i);
    });

    it('attaches user on valid token', async () => {
      const token = jwt.sign(
        { userId: 'u', tenantId: 't', email: 'a@b.c', role: 'member' },
        config.jwt.accessSecret,
        { expiresIn: '5m' }
      );
      const res = await request(buildApp([authenticate])).get('/test').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.user.userId).toBe('u');
    });
  });

  describe('authorize', () => {
    const token = jwt.sign(
      { userId: 'u', tenantId: 't', email: 'a@b.c', role: 'member' },
      config.jwt.accessSecret,
      { expiresIn: '5m' }
    );

    it('403 when role not allowed', async () => {
      const res = await request(buildApp([authenticate, authorize('admin')]))
        .get('/test')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('200 when role allowed', async () => {
      const res = await request(buildApp([authenticate, authorize('member', 'admin')]))
        .get('/test')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
    });
  });

  describe('optionalAuth', () => {
    it('passes through with no token', async () => {
      const res = await request(buildApp([optionalAuth])).get('/test');
      expect(res.status).toBe(200);
      expect(res.body.user).toBeUndefined();
    });

    it('attaches user when token valid', async () => {
      const token = jwt.sign(
        { userId: 'u', tenantId: 't', email: 'a@b.c', role: 'member' },
        config.jwt.accessSecret,
        { expiresIn: '5m' }
      );
      const res = await request(buildApp([optionalAuth])).get('/test').set('Authorization', `Bearer ${token}`);
      expect(res.body.user.userId).toBe('u');
    });

    it('ignores invalid token silently', async () => {
      const res = await request(buildApp([optionalAuth])).get('/test').set('Authorization', 'Bearer junk');
      expect(res.status).toBe(200);
      expect(res.body.user).toBeUndefined();
    });
  });

  describe('notFound', () => {
    it('returns 404 with NOT_FOUND code', async () => {
      const app = express();
      app.use(notFound);
      const res = await request(app).get('/missing');
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('errorHandler', () => {
    it('formats ValidationError as 422 with errors', async () => {
      const app = express();
      app.get('/x', (_req, _res, next) => next(new ValidationError({ email: ['required'] })));
      app.use(errorHandler);
      const res = await request(app).get('/x');
      expect(res.status).toBe(422);
      expect(res.body.error.errors).toEqual({ email: ['required'] });
    });

    it('uses statusCode from operational AppError', async () => {
      const app = express();
      app.get('/x', (_req, _res, next) => next(new AppError('teapot', 418, 'TEAPOT')));
      app.use(errorHandler);
      const res = await request(app).get('/x');
      expect(res.status).toBe(418);
      expect(res.body.error.code).toBe('TEAPOT');
    });

    it('returns 500 for unexpected errors', async () => {
      const app = express();
      app.get('/x', (_req, _res, next) => next(new Error('kaboom')));
      app.use(errorHandler);
      const res = await request(app).get('/x');
      expect(res.status).toBe(500);
      expect(res.body.error.code).toBe('INTERNAL_ERROR');
    });

    it('echoes correlationId from request', async () => {
      const app = express();
      app.get('/x', (_req, _res, next) => next(new AppError('nope', 400, 'BAD')));
      app.use(errorHandler);
      const res = await request(app).get('/x').set('x-correlation-id', 'abc-123');
      expect(res.body.correlationId).toBe('abc-123');
    });
  });
});
