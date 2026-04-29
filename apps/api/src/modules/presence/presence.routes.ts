import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import db from '../../config/database';
import redis from '../../config/redis';
import { authenticate } from '../../middleware/auth';

const router = Router();
router.use(authenticate);

const TTL = 45; // seconds

// POST /presence/incidents/:id/heartbeat — keep-alive (clients call every 20-30s)
router.post('/incidents/:id/heartbeat', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const key = `presence:${req.user!.tenantId}:incident:${req.params.id}`;
    const member = `${req.user!.userId}|${req.user!.email}`;
    await redis.zadd(key, Date.now(), member);
    await redis.expire(key, TTL * 2);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// GET /presence/incidents/:id — list users active in last 45s
router.get('/incidents/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const key = `presence:${req.user!.tenantId}:incident:${req.params.id}`;
    const cutoff = Date.now() - TTL * 1000;
    await redis.zremrangebyscore(key, 0, cutoff);
    const members = await redis.zrange(key, 0, -1, 'WITHSCORES');
    const viewers: { user_id: string; email: string; last_seen: number }[] = [];
    for (let i = 0; i < members.length; i += 2) {
      const [user_id, email] = members[i].split('|');
      viewers.push({ user_id, email, last_seen: parseInt(members[i + 1], 10) });
    }
    res.json({ success: true, data: viewers });
  } catch (err) { next(err); }
});

// DELETE /presence/incidents/:id — leave room (best-effort on unmount)
router.delete('/incidents/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const key = `presence:${req.user!.tenantId}:incident:${req.params.id}`;
    const member = `${req.user!.userId}|${req.user!.email}`;
    await redis.zrem(key, member);
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;
