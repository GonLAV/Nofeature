/**
 * Request-scoped context propagated via AsyncLocalStorage.
 *
 * Why this exists
 * ───────────────
 * Express request handlers fan out into dozens of service / repository
 * calls per request. Without a context store, every log line in those
 * deep call sites is anonymous — you can't tie a stack trace back to a
 * user or a correlation ID without manually threading `req` everywhere.
 *
 * AsyncLocalStorage gives us a "current request" you can read from any
 * async function descending from the request handler. The logger
 * automatically merges this into every log line, so existing callers
 * (`logger.info('foo')`) immediately gain `correlationId`, `userId`,
 * `tenantId`, `route`, etc. with no code changes in 60 modules.
 *
 * Cost: ~3% overhead on a hot path. Worth it.
 */

import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContext {
  correlationId: string;
  method?: string;
  route?: string;
  ip?: string;
  userId?: string;
  tenantId?: string;
  role?: string;
  startedAt: number;
}

const als = new AsyncLocalStorage<RequestContext>();

/** Run `fn` with a bound request context. */
export function runWithContext<T>(ctx: RequestContext, fn: () => T): T {
  return als.run(ctx, fn);
}

/** Returns the active context, or `undefined` outside of a request. */
export function getContext(): RequestContext | undefined {
  return als.getStore();
}

/**
 * Mutate fields on the active context. Safe no-op when called outside
 * of a request (e.g. from a worker or a test bootstrapping a logger).
 */
export function updateContext(patch: Partial<RequestContext>): void {
  const cur = als.getStore();
  if (!cur) return;
  Object.assign(cur, patch);
}

/** Test-only: useful for asserting ALS plumbing. */
export const __als_for_tests = als;
