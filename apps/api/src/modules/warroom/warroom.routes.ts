import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../../config/env';
import { authenticate } from '../../middleware/auth';
import { WarRoomRepository } from './warroom.repository';
import { IncidentRepository } from '../incidents/incident.repository';
import { publish, subscribe } from './warroom.events';
import { logger } from '../../utils/logger';

const router = Router();
const warRoomRepo = new WarRoomRepository();
const incidentRepo = new IncidentRepository();

// ── SSE stream  GET /warroom/incidents/:id/stream?token=<jwt> ──────────────
// EventSource can't set Authorization headers, so we accept token via ?token=
router.get('/incidents/:id/stream', async (req: Request, res: Response) => {
  const token = req.query.token as string | undefined;
  if (!token) {
    res.status(401).json({ error: 'Missing token' });
    return;
  }

  let user: { userId: string; tenantId: string; role: string; name: string; email: string };
  try {
    user = jwt.verify(token, config.jwt.accessSecret) as typeof user;
  } catch {
    res.status(401).json({ error: 'Invalid token' });
    return;
  }

  const incidentId = req.params.id;

  // Verify the incident belongs to the tenant
  const incident = await incidentRepo.findById(incidentId, user.tenantId);
  if (!incident) {
    res.status(404).json({ error: 'Incident not found' });
    return;
  }

  // SSE handshake
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering
  res.flushHeaders();

  // Send current incident state immediately so the client syncs on connect
  res.write(
    `data: ${JSON.stringify({ type: 'incident_updated', payload: incident })}\n\n`,
  );

  // Announce presence to other subscribers
  const displayName = user.name || user.email;
  publish(incidentId, {
    type: 'presence',
    payload: { userId: user.userId, userName: displayName, online: true },
  });

  const unsubscribe = subscribe(incidentId, res);

  // Heartbeat every 25 s to keep the connection alive through proxies
  const heartbeat = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch {
      clearInterval(heartbeat);
    }
  }, 25_000);

  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
    publish(incidentId, {
      type: 'presence',
      payload: { userId: user.userId, userName: displayName, online: false },
    });
    logger.info('SSE client disconnected', { incidentId, userId: user.userId });
  });
});

// ── Send chat message  POST /warroom/incidents/:id/messages ───────────────
router.post(
  '/incidents/:id/messages',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { content } = req.body as { content?: string };
      if (!content || content.trim().length === 0) {
        res.status(400).json({ error: 'content is required' });
        return;
      }

      const incidentId = req.params.id;
      const { tenantId, userId, name: userName } = req.user!;

      const incident = await incidentRepo.findById(incidentId, tenantId);
      if (!incident) {
        res.status(404).json({ error: 'Incident not found' });
        return;
      }

      const message = await warRoomRepo.saveMessage({
        incidentId,
        tenantId,
        userId,
        content: content.trim(),
      });

      const enriched = { ...message, user_name: userName };

      publish(incidentId, { type: 'message', payload: enriched });

      res.status(201).json({ success: true, data: enriched });
    } catch (err) {
      next(err);
    }
  },
);

// ── Get chat history  GET /warroom/incidents/:id/messages ─────────────────
router.get(
  '/incidents/:id/messages',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const incidentId = req.params.id;
      const { tenantId } = req.user!;

      const incident = await incidentRepo.findById(incidentId, tenantId);
      if (!incident) {
        res.status(404).json({ error: 'Incident not found' });
        return;
      }

      const messages = await warRoomRepo.getMessages(incidentId, tenantId);
      res.json({ success: true, data: messages });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
