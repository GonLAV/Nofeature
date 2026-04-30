/**
 * Request context middleware.
 *
 * Wraps every HTTP request in an AsyncLocalStorage scope so log lines
 * emitted by any descendant async function automatically carry the
 * correlation ID, route, and (after auth) the user / tenant.
 *
 * Also captures wall-clock duration and emits a single structured
 * "request completed" log on `res.finish` — replaces the noisy combined
 * morgan format with one searchable JSON line per request.
 */

import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { runWithContext, updateContext, getContext } from '../utils/requestContext';
import { logger } from '../utils/logger';

export function requestContextMiddleware(req: Request, res: Response, next: NextFunction) {
  const correlationId =
    (req.headers['x-correlation-id'] as string) || uuidv4();
  req.headers['x-correlation-id'] = correlationId;
  res.setHeader('X-Correlation-ID', correlationId);

  // Once auth runs, it'll patch userId/tenantId into this context.
  const ctx = {
    correlationId,
    method: req.method,
    route: req.originalUrl?.split('?')[0],
    ip: req.ip,
    startedAt: Date.now(),
  };

  res.on('finish', () => {
    const c = getContext();
    if (!c) return;
    const durationMs = Date.now() - c.startedAt;
    // Skip noisy probes — they have their own logging in the health module.
    if (req.path === '/livez' || req.path === '/readyz' || req.path === '/health') return;
    logger.http('request', {
      status: res.statusCode,
      durationMs,
      contentLength: res.getHeader('content-length'),
    });
  });

  runWithContext(ctx, () => next());
}

/**
 * Helper used by `authenticate` to inject identity fields once the JWT
 * has been verified. Living next to the middleware keeps the
 * concerns colocated.
 */
export function bindIdentityToContext(payload: {
  userId: string; tenantId: string; role: string;
}) {
  updateContext({
    userId: payload.userId,
    tenantId: payload.tenantId,
    role: payload.role,
  });
}
