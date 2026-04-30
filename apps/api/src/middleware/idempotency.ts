/**
 * Stripe-style idempotency keys.
 *
 * Why
 * ───
 * If a client retries a `POST /incidents` after a transient error,
 * we MUST NOT create a duplicate incident. The `Idempotency-Key`
 * header lets the client say "this logical operation has ID X —
 * if you've already processed it, give me the same answer".
 *
 * Storage
 * ───────
 * Redis `idem:{tenantId}:{method}:{path}:{key}` → JSON
 *   { fingerprint, status, body }
 *
 *   • TTL: 24h (configurable). Long enough for retries / outages,
 *     short enough that keys can be safely reused.
 *   • Tenant-scoped — keys do NOT collide across tenants.
 *   • Fingerprint = sha256(canonical body). Replays MUST present
 *     the same body; mismatches return 422 to surface client bugs.
 *   • Locking: `SET NX EX` reserves the slot atomically; if another
 *     request is already in flight we return 409 (`in_progress`)
 *     rather than racing.
 *
 * Failure behaviour
 * ─────────────────
 * Redis outages must NOT block writes. If we can't reach Redis we
 * log a warning and pass through — at-least-once is better than
 * no-writes. (Idempotency is a *retry-safety* feature, not a
 * correctness gate for first-time requests.)
 */

import type { Request, Response, NextFunction, RequestHandler } from 'express';
import crypto from 'node:crypto';
import redis from '../config/redis';
import { logger } from '../utils/logger';

const KEY_TTL_SECONDS = 24 * 60 * 60;
// Cap stored response bodies — anything larger is suspicious for an
// idempotent write endpoint and would bloat Redis.
const MAX_CACHED_BODY_BYTES = 64 * 1024;
const KEY_PATTERN = /^[A-Za-z0-9_\-]{8,128}$/;

interface CachedResponse {
  fingerprint: string;
  status:      number;
  body:        unknown;
}

function fingerprint(body: unknown): string {
  const json = JSON.stringify(body ?? null, Object.keys(body || {}).sort());
  return crypto.createHash('sha256').update(json).digest('hex');
}

function redisKey(req: Request, key: string): string {
  const tenant = req.user?.tenantId ?? 'anon';
  return `idem:${tenant}:${req.method}:${req.path}:${key}`;
}

export const idempotency: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const headerKey = req.header('Idempotency-Key');
  if (!headerKey) return next(); // Header is optional.

  if (!KEY_PATTERN.test(headerKey)) {
    return res.status(400).json({
      error: { code: 'INVALID_IDEMPOTENCY_KEY',
        message: 'Idempotency-Key must be 8-128 chars [A-Za-z0-9_-]' },
    });
  }

  const fp  = fingerprint(req.body);
  const key = redisKey(req, headerKey);

  // 1. Try to claim the slot. SET NX EX is the atomic primitive.
  let claimed = false;
  try {
    const reservation = JSON.stringify({ fingerprint: fp, status: 0, body: null });
    const result = await redis.set(key, reservation, 'EX', KEY_TTL_SECONDS, 'NX');
    claimed = result === 'OK';
  } catch (err) {
    // Redis down? Don't block writes.
    logger.warn('Idempotency check skipped (Redis unavailable)', {
      error: (err as Error).message,
    });
    return next();
  }

  if (!claimed) {
    // 2. Slot exists — read it.
    let raw: string | null = null;
    try {
      raw = await redis.get(key);
    } catch {
      return next(); // Same fail-open policy.
    }
    if (!raw) return next(); // Race: TTL'd between SET NX and GET.
    let cached: CachedResponse;
    try {
      cached = JSON.parse(raw);
    } catch {
      return next(); // Corrupt entry — best to retry afresh.
    }

    if (cached.fingerprint !== fp) {
      // Same key, different body. Stripe returns 422 here.
      return res.status(422).json({
        error: { code: 'IDEMPOTENCY_KEY_REUSED',
          message: 'Idempotency-Key was used with a different request body' },
      });
    }
    if (cached.status === 0) {
      // First request still in flight.
      return res.status(409).json({
        error: { code: 'REQUEST_IN_PROGRESS',
          message: 'A request with this Idempotency-Key is already being processed' },
      });
    }
    res.setHeader('Idempotent-Replay', 'true');
    return res.status(cached.status).json(cached.body);
  }

  // 3. We claimed the slot. Capture the response so future retries replay it.
  const originalJson = res.json.bind(res);
  res.json = (body: unknown) => {
    // Only persist successful, non-stream responses.
    const ok    = res.statusCode >= 200 && res.statusCode < 300;
    const small = JSON.stringify(body).length <= MAX_CACHED_BODY_BYTES;
    if (ok && small) {
      const entry: CachedResponse = { fingerprint: fp, status: res.statusCode, body };
      // Fire and forget — never block the response.
      redis.set(key, JSON.stringify(entry), 'EX', KEY_TTL_SECONDS).catch((err) =>
        logger.warn('Idempotency cache write failed', { error: (err as Error).message }),
      );
    } else {
      // Don't cache errors / huge bodies — release the slot so the
      // client can retry against a clean state.
      redis.del(key).catch(() => undefined);
    }
    return originalJson(body);
  };

  next();
};

// Test-only export.
export const _internal = { fingerprint, redisKey, KEY_TTL_SECONDS };
