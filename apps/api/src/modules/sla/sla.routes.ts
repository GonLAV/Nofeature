import { Router, Request, Response, NextFunction } from 'express';
import db from '../../config/database';
import { authenticate } from '../../middleware/auth';

const router = Router();
router.use(authenticate);

// Default SLA targets in minutes (resolution time)
const SLA_TARGETS_MIN: Record<string, number> = {
  P1: 30,
  P2: 120,
  P3: 480,
  P4: 1440,
};

function computeBreach(severity: string, createdAt: Date, resolvedAt: Date | null) {
  const target = SLA_TARGETS_MIN[severity] ?? 1440;
  const end = resolvedAt ? new Date(resolvedAt).getTime() : Date.now();
  const elapsedMin = (end - new Date(createdAt).getTime()) / 60000;
  return {
    target_min: target,
    elapsed_min: Math.round(elapsedMin),
    breached: elapsedMin > target,
    remaining_min: Math.round(target - elapsedMin),
  };
}

// GET /sla/targets — current SLA policy
router.get('/targets', (_req: Request, res: Response) => {
  res.json({ success: true, data: SLA_TARGETS_MIN });
});

// GET /sla/status — active incidents with SLA state + 30-day metrics
router.get('/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenantId;

    const active = await db.query(
      `SELECT id, title, severity, status, created_at, resolved_at
       FROM incidents
       WHERE tenant_id = $1 AND deleted_at IS NULL
         AND status IN ('open','investigating')
       ORDER BY severity, created_at`,
      [tenantId]
    );

    const activeWithSla = active.rows.map((i) => ({ ...i, sla: computeBreach(i.severity, i.created_at, null) }));

    const stats = await db.query(
      `SELECT severity,
              COUNT(*) FILTER (WHERE resolved_at IS NOT NULL) AS resolved_count,
              COUNT(*) AS total_count,
              AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))/60)
                FILTER (WHERE resolved_at IS NOT NULL) AS avg_mttr_min
       FROM incidents
       WHERE tenant_id = $1 AND deleted_at IS NULL
         AND created_at >= NOW() - INTERVAL '30 days'
       GROUP BY severity`,
      [tenantId]
    );

    // Compute breach rate (resolved past target / total resolved) per severity
    const breachQuery = await db.query(
      `SELECT severity,
              COUNT(*) FILTER (
                WHERE resolved_at IS NOT NULL
                  AND EXTRACT(EPOCH FROM (resolved_at - created_at))/60 > CASE severity
                    WHEN 'P1' THEN 30 WHEN 'P2' THEN 120 WHEN 'P3' THEN 480 ELSE 1440 END
              ) AS breached_count,
              COUNT(*) FILTER (WHERE resolved_at IS NOT NULL) AS resolved_count
       FROM incidents
       WHERE tenant_id = $1 AND deleted_at IS NULL
         AND created_at >= NOW() - INTERVAL '30 days'
       GROUP BY severity`,
      [tenantId]
    );

    const metrics = stats.rows.map((row) => {
      const breach = breachQuery.rows.find((b) => b.severity === row.severity);
      const breached = breach ? Number(breach.breached_count) : 0;
      const resolved = breach ? Number(breach.resolved_count) : 0;
      return {
        severity: row.severity,
        target_min: SLA_TARGETS_MIN[row.severity] ?? null,
        avg_mttr_min: row.avg_mttr_min ? Math.round(Number(row.avg_mttr_min)) : null,
        total: Number(row.total_count),
        resolved,
        breached,
        breach_rate: resolved > 0 ? Math.round((breached / resolved) * 100) : 0,
      };
    });

    res.json({
      success: true,
      data: {
        active: activeWithSla,
        breached_now: activeWithSla.filter((i) => i.sla.breached).length,
        metrics_30d: metrics,
      },
    });
  } catch (err) { next(err); }
});

export default router;
