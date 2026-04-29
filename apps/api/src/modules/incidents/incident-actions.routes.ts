import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import db from '../../config/database';

const router = Router();
router.use(authenticate);

// POST /incidents/:id/clone — duplicate an incident as a new open one
router.post(
  '/incidents/:id/clone',
  authorize('owner', 'admin', 'manager'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.user!.tenantId;
      const userId = req.user!.userId;
      const sourceId = req.params.id;

      const src = await db.query(
        `SELECT * FROM incidents WHERE id=$1 AND tenant_id=$2 AND deleted_at IS NULL`,
        [sourceId, tenantId]
      );
      if (src.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'incident not found' });
      }
      const s = src.rows[0];

      const newTitle = String(req.body?.title ?? `Clone of: ${s.title}`).slice(0, 200);
      const newSeverity = String(req.body?.severity ?? s.severity);

      const ins = await db.query(
        `INSERT INTO incidents (tenant_id, title, description, severity, status, created_by, affected_systems)
         VALUES ($1,$2,$3,$4,'open',$5,$6) RETURNING *`,
        [tenantId, newTitle, s.description, newSeverity, userId, s.affected_systems || []]
      );
      const cloned = ins.rows[0];

      // Copy linked services, if any (table might not exist on older schemas — guarded)
      try {
        await db.query(
          `INSERT INTO incident_services (tenant_id, incident_id, service_id)
             SELECT tenant_id, $2, service_id FROM incident_services
              WHERE tenant_id=$1 AND incident_id=$3`,
          [tenantId, cloned.id, sourceId]
        );
      } catch {
        /* services table may not exist yet */
      }

      await db.query(
        `INSERT INTO incident_timeline (incident_id, tenant_id, user_id, action, metadata)
         VALUES ($1,$2,$3,'INCIDENT_CLONED',$4)`,
        [cloned.id, tenantId, userId, JSON.stringify({ source_id: sourceId })]
      );

      await db.query(
        `INSERT INTO audit_logs (tenant_id, user_id, action, resource, resource_id, metadata)
         VALUES ($1,$2,'incident.cloned','incident',$3,$4)`,
        [tenantId, userId, cloned.id, JSON.stringify({ source_id: sourceId })]
      );

      return res.status(201).json({ success: true, data: cloned });
    } catch (err) {
      next(err);
    }
  }
);

// POST /incidents/:id/slash { text } — interpret slash commands
// Supports: /resolve, /reopen, /investigate, /monitor, /sev1 /sev2 /sev3 /sev4, /assign email@host, /ack
router.post('/incidents/:id/slash', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.userId;
    const role = req.user!.role;
    const incidentId = req.params.id;
    const raw = String(req.body?.text ?? '').trim();
    if (!raw.startsWith('/')) {
      return res.status(400).json({ success: false, error: 'must start with /' });
    }
    const [cmdRaw, ...rest] = raw.slice(1).split(/\s+/);
    const cmd = cmdRaw.toLowerCase();
    const arg = rest.join(' ').trim();

    const isPrivileged = ['owner', 'admin', 'manager'].includes(role);

    const inc = await db.query(
      `SELECT id, status FROM incidents WHERE id=$1 AND tenant_id=$2 AND deleted_at IS NULL`,
      [incidentId, tenantId]
    );
    if (inc.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'incident not found' });
    }

    const setStatus = async (status: string) => {
      if (!isPrivileged) throw new Error('forbidden');
      await db.query(
        `UPDATE incidents SET status=$1, updated_at=NOW(),
            resolved_at = CASE WHEN $1='resolved' THEN NOW() ELSE resolved_at END
          WHERE id=$2 AND tenant_id=$3`,
        [status, incidentId, tenantId]
      );
      await db.query(
        `INSERT INTO incident_timeline (incident_id, tenant_id, user_id, action, metadata)
         VALUES ($1,$2,$3,'STATUS_CHANGED',$4)`,
        [incidentId, tenantId, userId, JSON.stringify({ to: status, via: 'slash' })]
      );
    };

    const setSeverity = async (sev: string) => {
      if (!isPrivileged) throw new Error('forbidden');
      await db.query(
        `UPDATE incidents SET severity=$1, updated_at=NOW() WHERE id=$2 AND tenant_id=$3`,
        [sev, incidentId, tenantId]
      );
      await db.query(
        `INSERT INTO incident_timeline (incident_id, tenant_id, user_id, action, metadata)
         VALUES ($1,$2,$3,'SEVERITY_CHANGED',$4)`,
        [incidentId, tenantId, userId, JSON.stringify({ to: sev, via: 'slash' })]
      );
    };

    let result: { command: string; message: string } = { command: cmd, message: 'ok' };

    switch (cmd) {
      case 'resolve':
        await setStatus('resolved'); result.message = 'Incident resolved'; break;
      case 'reopen':
      case 'open':
        await setStatus('open'); result.message = 'Incident reopened'; break;
      case 'investigate':
      case 'investigating':
        await setStatus('investigating'); result.message = 'Status: investigating'; break;
      case 'monitor':
      case 'monitoring':
        await setStatus('monitoring'); result.message = 'Status: monitoring'; break;
      case 'sev1': case 'p1': await setSeverity('P1'); result.message = 'Severity → P1'; break;
      case 'sev2': case 'p2': await setSeverity('P2'); result.message = 'Severity → P2'; break;
      case 'sev3': case 'p3': await setSeverity('P3'); result.message = 'Severity → P3'; break;
      case 'sev4': case 'p4': await setSeverity('P4'); result.message = 'Severity → P4'; break;
      case 'ack':
      case 'acknowledge': {
        await db.query(
          `UPDATE incidents SET acknowledged_at=NOW(), acknowledged_by=$1, updated_at=NOW()
            WHERE id=$2 AND tenant_id=$3 AND acknowledged_at IS NULL`,
          [userId, incidentId, tenantId]
        );
        await db.query(
          `INSERT INTO incident_timeline (incident_id, tenant_id, user_id, action, metadata)
           VALUES ($1,$2,$3,'ACKNOWLEDGED',$4)`,
          [incidentId, tenantId, userId, JSON.stringify({ via: 'slash' })]
        );
        result.message = 'Acknowledged';
        break;
      }
      case 'assign': {
        if (!isPrivileged) return res.status(403).json({ success: false, error: 'forbidden' });
        if (!arg) return res.status(400).json({ success: false, error: 'usage: /assign <email>' });
        const u = await db.query(
          `SELECT id, name FROM users WHERE tenant_id=$1 AND lower(email)=lower($2) LIMIT 1`,
          [tenantId, arg.replace(/^@/, '')]
        );
        if (u.rows.length === 0) return res.status(404).json({ success: false, error: 'user not found' });
        await db.query(
          `UPDATE incidents SET commander_id=$1, updated_at=NOW() WHERE id=$2 AND tenant_id=$3`,
          [u.rows[0].id, incidentId, tenantId]
        );
        await db.query(
          `INSERT INTO incident_timeline (incident_id, tenant_id, user_id, action, metadata)
           VALUES ($1,$2,$3,'COMMANDER_ASSIGNED',$4)`,
          [incidentId, tenantId, userId, JSON.stringify({ commanderId: u.rows[0].id, via: 'slash' })]
        );
        result.message = `Commander → ${u.rows[0].name}`;
        break;
      }
      default:
        return res.status(400).json({
          success: false,
          error: `unknown command: /${cmd}`,
          help: ['/resolve', '/reopen', '/investigate', '/monitor', '/sev1..4', '/assign <email>', '/ack'],
        });
    }

    await db.query(
      `INSERT INTO audit_logs (tenant_id, user_id, action, resource, resource_id, metadata)
       VALUES ($1,$2,'slash.command','incident',$3,$4)`,
      [tenantId, userId, incidentId, JSON.stringify({ raw, command: cmd, arg })]
    );

    return res.json({ success: true, data: result });
  } catch (err: any) {
    if (err?.message === 'forbidden') {
      return res.status(403).json({ success: false, error: 'forbidden' });
    }
    next(err);
  }
});

export default router;
