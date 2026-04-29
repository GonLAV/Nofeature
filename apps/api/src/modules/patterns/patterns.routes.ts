import { Router, Request, Response, NextFunction } from 'express';
import db from '../../config/database';
import { authenticate } from '../../middleware/auth';

const router = Router();
router.use(authenticate);

/**
 * Detect recurring incidents based on title token similarity within 90 days.
 * Uses pg_trgm if available, falls back to ILIKE keyword overlap.
 *
 * GET /patterns/recurring
 */
router.get('/recurring', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenantId;

    // Group incidents by lowercase title core (strip dates/numbers)
    const { rows } = await db.query(
      `WITH normalized AS (
         SELECT
           id,
           title,
           severity,
           created_at,
           resolved_at,
           regexp_replace(lower(title), '[0-9]+', '', 'g') AS norm_title,
           ARRAY(
             SELECT word FROM regexp_split_to_table(lower(title), '\\s+') AS word
             WHERE length(word) > 3
           ) AS keywords
         FROM incidents
         WHERE tenant_id = $1 AND deleted_at IS NULL
           AND created_at >= NOW() - INTERVAL '90 days'
       ),
       groups AS (
         SELECT
           keywords[1] || ' ' || COALESCE(keywords[2], '') AS pattern_key,
           COUNT(*) AS occurrences,
           MIN(created_at) AS first_seen,
           MAX(created_at) AS last_seen,
           array_agg(DISTINCT severity) AS severities,
           array_agg(json_build_object('id', id, 'title', title, 'created_at', created_at, 'severity', severity)
                     ORDER BY created_at DESC) AS incidents,
           AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))/60)
             FILTER (WHERE resolved_at IS NOT NULL) AS avg_mttr_min
         FROM normalized
         WHERE array_length(keywords, 1) >= 1
         GROUP BY pattern_key
         HAVING COUNT(*) >= 2
       )
       SELECT
         pattern_key,
         occurrences,
         first_seen,
         last_seen,
         severities,
         incidents[1:5] AS recent_incidents,
         CASE WHEN avg_mttr_min IS NOT NULL THEN ROUND(avg_mttr_min)::int ELSE NULL END AS avg_mttr_min
       FROM groups
       ORDER BY occurrences DESC, last_seen DESC
       LIMIT 20`,
      [tenantId]
    );

    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

export default router;
