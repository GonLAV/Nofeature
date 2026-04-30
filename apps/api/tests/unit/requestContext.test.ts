/**
 * AsyncLocalStorage-backed request context tests.
 *
 * These guard the contract that descendant async functions inside
 * `runWithContext` see the current context, while sibling/non-wrapped
 * code does not — which is what the logger relies on to attribute
 * log lines to the right request.
 */

import {
  runWithContext, getContext, updateContext, RequestContext,
} from '../../src/utils/requestContext';

const baseCtx = (): RequestContext => ({
  correlationId: 'corr-1',
  startedAt:     Date.now(),
});

describe('requestContext (AsyncLocalStorage)', () => {
  it('getContext is undefined outside of a wrapped scope', () => {
    expect(getContext()).toBeUndefined();
  });

  it('runWithContext exposes the bound context inside the callback', () => {
    const ctx = baseCtx();
    runWithContext(ctx, () => {
      expect(getContext()).toBe(ctx);
      expect(getContext()?.correlationId).toBe('corr-1');
    });
  });

  it('context survives across awaited microtasks (the whole point of ALS)', async () => {
    const ctx = baseCtx();
    await runWithContext(ctx, async () => {
      await Promise.resolve();
      await new Promise((r) => setImmediate(r));
      expect(getContext()?.correlationId).toBe('corr-1');
    });
  });

  it('updateContext mutates the active context (e.g. injecting userId after auth)', () => {
    runWithContext(baseCtx(), () => {
      updateContext({ userId: 'u-42', tenantId: 't-7', role: 'owner' });
      const c = getContext()!;
      expect(c.userId).toBe('u-42');
      expect(c.tenantId).toBe('t-7');
      expect(c.role).toBe('owner');
    });
  });

  it('updateContext is a no-op outside a scope (does not throw)', () => {
    expect(() => updateContext({ userId: 'u-1' })).not.toThrow();
    expect(getContext()).toBeUndefined();
  });

  it('isolates concurrent contexts — sibling requests do not leak', async () => {
    const seen: string[] = [];
    await Promise.all([
      runWithContext({ ...baseCtx(), correlationId: 'A' }, async () => {
        await new Promise((r) => setTimeout(r, 5));
        seen.push(getContext()!.correlationId);
      }),
      runWithContext({ ...baseCtx(), correlationId: 'B' }, async () => {
        await new Promise((r) => setTimeout(r, 1));
        seen.push(getContext()!.correlationId);
      }),
    ]);
    expect(seen.sort()).toEqual(['A', 'B']);
  });
});
