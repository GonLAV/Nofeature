import { Router, Request, Response, NextFunction } from 'express';
import db from '../../config/database';
import { authenticate } from '../../middleware/auth';

const router = Router();
router.use(authenticate);

/**
 * GET /metrics/overview?days=30
 * Returns time-series for incidents per day, MTTR trend, severity mix.
 */
router.get('/overview', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const days = Math.min(Math.max(parseInt(String(req.query.days ?? '30'), 10) || 30, 7), 365);
    const tenantId = req.user!.tenantId;

    const series = await db.query(
      `SELECT
         date_trunc('day', created_at)::date AS day,
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE severity = 'P1') AS p1,
         COUNT(*) FILTER (WHERE severity = 'P2') AS p2,
         COUNT(*) FILTER (WHERE severity = 'P3') AS p3,
         COUNT(*) FILTER (WHERE severity = 'P4') AS p4
       FROM incidents
       WHERE tenant_id = $1 AND deleted_at IS NULL
         AND created_at >= NOW() - ($2 || ' days')::interval
       GROUP BY day
       ORDER BY day`,
      [tenantId, days]
    );

    const mttrTrend = await db.query(
      `SELECT
         date_trunc('week', created_at)::date AS week,
         severity,
         AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))/60)::int AS avg_mttr_min,
         COUNT(*) AS count
       FROM incidents
       WHERE tenant_id = $1 AND deleted_at IS NULL
         AND resolved_at IS NOT NULL
         AND created_at >= NOW() - ($2 || ' days')::interval
       GROUP BY week, severity
       ORDER BY week, severity`,
      [tenantId, days]
    );

    const totals = await db.query(
      `SELECT
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE status IN ('open','investigating')) AS active,
         COUNT(*) FILTER (WHERE status = 'resolved') AS resolved,
         AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))/60)::int
           FILTER (WHERE resolved_at IS NOT NULL) AS avg_mttr_min
       FROM incidents
       WHERE tenant_id = $1 AND deleted_at IS NULL
         AND created_at >= NOW() - ($2 || ' days')::interval`,
      [tenantId, days]
    );

    const topSystems = await db.query(
      `SELECT system, COUNT(*) AS count
       FROM (
         SELECT UNNEST(affected_systems) AS system
         FROM incidents
         WHERE tenant_id = $1 AND deleted_at IS NULL
           AND created_at >= NOW() - ($2 || ' days')::interval
       ) s
       WHERE system <> ''
       GROUP BY system
       ORDER BY count DESC
       LIMIT 10`,
      [tenantId, days]
    );

    res.json({
      success: true,
      data: {
        days,
        totals: totals.rows[0] ?? { total: 0, active: 0, resolved: 0, avg_mttr_min: null },
        series: series.rows,
        mttr_trend: mttrTrend.rows,
        top_systems: topSystems.rows,
      },
    });
  } catch (err) { next(err); }
});

export default router;
