/**
 * Liveness, readiness, and back-compat health endpoints.
 *
 *  /livez  — process is alive. Always 200 unless the event loop is dead.
 *            Used by k8s as the **liveness** probe; failing it triggers
 *            a pod restart, so we keep this strict and dependency-free.
 *
 *  /readyz — process can serve traffic. Pings DB + Redis with a short
 *            timeout. Used as the k8s **readiness** probe; failing it
 *            removes the pod from the service load balancer without
 *            killing it. Returns per-dependency status for ops dashboards.
 *
 *  /health — historical alias kept for any external monitor still
 *            wired to the old path. Mirrors `/readyz`.
 */

import { Router, Request, Response } from 'express';
import db from '../../config/database';
import redis from '../../config/redis';
import { config } from '../../config/env';

const router = Router();

const PROBE_TIMEOUT_MS = 1500;

async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms),
    ),
  ]);
}

interface DependencyResult {
  status: 'up' | 'down';
  latencyMs: number;
  error?: string;
}

async function probeDb(): Promise<DependencyResult> {
  const t0 = Date.now();
  try {
    await withTimeout(db.query('SELECT 1'), PROBE_TIMEOUT_MS, 'db');
    return { status: 'up', latencyMs: Date.now() - t0 };
  } catch (err) {
    return { status: 'down', latencyMs: Date.now() - t0, error: (err as Error).message };
  }
}

async function probeRedis(): Promise<DependencyResult> {
  const t0 = Date.now();
  try {
    const reply = await withTimeout(redis.ping(), PROBE_TIMEOUT_MS, 'redis');
    if (reply !== 'PONG') throw new Error(`unexpected reply ${reply}`);
    return { status: 'up', latencyMs: Date.now() - t0 };
  } catch (err) {
    return { status: 'down', latencyMs: Date.now() - t0, error: (err as Error).message };
  }
}

router.get('/livez', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'incident-war-room-api', uptimeSec: Math.round(process.uptime()) });
});

router.get('/readyz', async (_req: Request, res: Response) => {
  const [database, redisDep] = await Promise.all([probeDb(), probeRedis()]);
  const ready = database.status === 'up' && redisDep.status === 'up';
  res.status(ready ? 200 : 503).json({
    status: ready ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    version: config.apiVersion,
    dependencies: { database, redis: redisDep },
  });
});

// Back-compat: mirror /readyz so older monitors keep working.
router.get('/health', async (_req: Request, res: Response) => {
  const [database, redisDep] = await Promise.all([probeDb(), probeRedis()]);
  const ready = database.status === 'up' && redisDep.status === 'up';
  res.status(ready ? 200 : 503).json({
    status: ready ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    version: config.apiVersion,
    dependencies: { database, redis: redisDep },
  });
});

export default router;
export const _internal = { probeDb, probeRedis };
