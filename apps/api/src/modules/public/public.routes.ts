import { Router, Request, Response, NextFunction } from 'express';
import db from '../../config/database';

const router = Router();

// GET /public/status/:slug — no auth, returns live status for a tenant's status page
router.get('/status/:slug', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { rows: tenants } = await db.query(
      `SELECT id, name, slug FROM tenants WHERE slug = $1 AND is_active = true LIMIT 1`,
      [req.params.slug],
    );
    if (!tenants[0]) {
      res.status(404).json({ error: 'Organization not found' });
      return;
    }
    const tenant = tenants[0] as { id: string; name: string; slug: string };

    // Active incidents (open or investigating)
    const { rows: active } = await db.query(
      `SELECT id, title, severity, status, affected_systems, created_at
       FROM incidents
       WHERE tenant_id = $1
         AND status IN ('open','investigating')
         AND deleted_at IS NULL
       ORDER BY severity ASC, created_at DESC
       LIMIT 20`,
      [tenant.id],
    );

    // Recently resolved (last 30 days)
    const { rows: recent } = await db.query(
      `SELECT id, title, severity, status, affected_systems, created_at, resolved_at
       FROM incidents
       WHERE tenant_id = $1
         AND status IN ('resolved','closed')
         AND resolved_at > NOW() - INTERVAL '30 days'
         AND deleted_at IS NULL
       ORDER BY resolved_at DESC
       LIMIT 10`,
      [tenant.id],
    );

    let overall: 'operational' | 'degraded' | 'outage' = 'operational';
    if (active.some((i: { severity: string }) => i.severity === 'P1')) overall = 'outage';
    else if (active.length > 0) overall = 'degraded';

    res.json({
      success: true,
      data: {
        organization: { name: tenant.name, slug: tenant.slug },
        overall,
        activeIncidents: active,
        recentIncidents: recent,
        updatedAt: new Date().toISOString(),
      },
    });
  } catch (err) { next(err); }
});

export default router;
