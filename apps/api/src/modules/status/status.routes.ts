import { Router, Request, Response, NextFunction } from 'express';
import db from '../../config/database';
import { NotFoundError } from '../../utils/errors';

const router = Router();

/**
 * Public status page endpoint — no auth.
 * GET /api/v1/public/status/:slug
 */
router.get('/status/:slug', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { slug } = req.params;

    const tenantRes = await db.query(
      `SELECT id, name, slug FROM tenants WHERE slug = $1 AND is_active = true LIMIT 1`,
      [slug]
    );
    const tenant = tenantRes.rows[0];
    if (!tenant) throw new NotFoundError('Status page not found');

    // Active (open / investigating) incidents
    const activeRes = await db.query(
      `SELECT id, title, severity, status, affected_systems, created_at, updated_at
       FROM incidents
       WHERE tenant_id = $1
         AND status IN ('open','investigating')
         AND deleted_at IS NULL
       ORDER BY created_at DESC`,
      [tenant.id]
    );

    // Attach latest stakeholder updates per active incident
    const activeIds = activeRes.rows.map((i: any) => i.id);
    let updatesByIncident: Record<string, any[]> = {};
    if (activeIds.length > 0) {
      const upRes = await db.query(
        `SELECT incident_id, status, body, posted_at
           FROM incident_status_updates
          WHERE tenant_id = $1 AND incident_id = ANY($2::uuid[])
          ORDER BY posted_at DESC`,
        [tenant.id, activeIds]
      );
      for (const u of upRes.rows) {
        (updatesByIncident[u.incident_id] ||= []).push({
          status: u.status,
          body: u.body,
          posted_at: u.posted_at,
        });
      }
      for (const inc of activeRes.rows as any[]) {
        inc.updates = (updatesByIncident[inc.id] || []).slice(0, 10);
      }
    }

    // Recent history (last 90 days, resolved/closed)
    const historyRes = await db.query(
      `SELECT id, title, severity, status, created_at, resolved_at
       FROM incidents
       WHERE tenant_id = $1
         AND deleted_at IS NULL
         AND created_at >= NOW() - INTERVAL '90 days'
       ORDER BY created_at DESC
       LIMIT 50`,
      [tenant.id]
    );

    // Simple uptime: % of last 90 days without an active P1
    const downtimeRes = await db.query(
      `SELECT
         COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(resolved_at, NOW()) - created_at))), 0)::bigint AS downtime_seconds
       FROM incidents
       WHERE tenant_id = $1
         AND deleted_at IS NULL
         AND severity = 'P1'
         AND created_at >= NOW() - INTERVAL '90 days'`,
      [tenant.id]
    );
    const totalSeconds = 90 * 24 * 60 * 60;
    const downtime = Number(downtimeRes.rows[0].downtime_seconds) || 0;
    const uptimePct = Math.max(0, Math.min(100, ((totalSeconds - downtime) / totalSeconds) * 100));

    const overall =
      activeRes.rows.some((i) => i.severity === 'P1') ? 'major_outage'
      : activeRes.rows.some((i) => i.severity === 'P2') ? 'partial_outage'
      : activeRes.rows.length > 0 ? 'degraded'
      : 'operational';

    res.json({
      success: true,
      data: {
        tenant: { name: tenant.name, slug: tenant.slug },
        overall,
        uptime_90d: Number(uptimePct.toFixed(3)),
        active_incidents: activeRes.rows,
        recent_incidents: historyRes.rows,
        updated_at: new Date().toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
