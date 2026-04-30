/**
 * Incident Momentum Index — DB-bound service layer.
 *
 * Responsibilities:
 *  • Gather raw activity signals from incident_timeline + comments + status updates + action_items.
 *  • Delegate to `computeMomentum` for the pure score.
 *  • Persist a snapshot to incident_momentum_snapshots.
 *  • If the score is stalled and we haven't logged a stall in the recent window,
 *    write a single timeline entry so responders see the warning in-context.
 */

import db from '../../config/database';
import { logger } from '../../utils/logger';
import { computeMomentum, MomentumInputs, MomentumResult } from './momentum.compute';

interface IncidentRow {
  id: string;
  severity: string;
  status: string;
  created_at: Date;
  resolved_at: Date | null;
}

const STALL_REPEAT_GUARD_MIN = 15;

export async function recomputeMomentum(
  tenantId: string,
  incidentId: string,
  now: Date = new Date(),
): Promise<MomentumResult> {
  const incQ = await db.query(
    `SELECT id, severity, status, created_at, resolved_at
       FROM incidents
      WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
    [incidentId, tenantId],
  );
  if (incQ.rows.length === 0) {
    const err: Error & { status?: number } = new Error('incident not found');
    err.status = 404;
    throw err;
  }
  const inc = incQ.rows[0] as IncidentRow;

  const inputs = await gatherSignals(tenantId, incidentId, inc, now);
  const result = computeMomentum(inputs);

  await persistSnapshot(tenantId, incidentId, result);
  if (result.is_stalled) {
    await maybeLogStallTimelineEntry(tenantId, incidentId, result, now).catch((e) => {
      logger.warn('momentum.stall.log.failed', { error: (e as Error).message, incidentId });
    });
  }
  return result;
}

export async function getMomentumHistory(
  tenantId: string,
  incidentId: string,
  limit = 60,
): Promise<Array<{ score: number; category: string; signals: unknown; captured_at: Date }>> {
  const { rows } = await db.query(
    `SELECT score, category, signals, captured_at
       FROM incident_momentum_snapshots
      WHERE tenant_id = $1 AND incident_id = $2
      ORDER BY captured_at DESC
      LIMIT $3`,
    [tenantId, incidentId, Math.min(Math.max(limit, 1), 500)],
  );
  return rows.reverse() as Array<{ score: number; category: string; signals: unknown; captured_at: Date }>;
}

async function gatherSignals(
  tenantId: string,
  incidentId: string,
  inc: IncidentRow,
  now: Date,
): Promise<MomentumInputs> {
  // Run signal queries in parallel.
  const [timeline, comments, statusUpdates, actionItems, lastEvent] = await Promise.all([
    countSince(`SELECT user_id, created_at FROM incident_timeline
                  WHERE tenant_id = $1 AND incident_id = $2 AND created_at >= $3`,
                  tenantId, incidentId, now),
    countSince(`SELECT user_id, created_at FROM incident_comments
                  WHERE tenant_id = $1 AND incident_id = $2 AND created_at >= $3`,
                  tenantId, incidentId, now),
    countSinceMaybe(`SELECT NULL::uuid AS user_id, created_at FROM incident_status_updates
                       WHERE tenant_id = $1 AND incident_id = $2 AND created_at >= $3`,
                       tenantId, incidentId, now),
    loadActionItems(tenantId, incidentId),
    loadLastEventAt(tenantId, incidentId),
  ]);

  const window5 = new Date(now.getTime() - 5 * 60_000);
  const window15 = new Date(now.getTime() - 15 * 60_000);

  const inWindow = (rows: { user_id: string | null; created_at: Date }[], cutoff: Date) =>
    rows.filter((r) => new Date(r.created_at) >= cutoff);

  const all15 = [...timeline, ...comments, ...statusUpdates];
  const events5m = all15.filter((r) => new Date(r.created_at) >= window5).length;
  const events15m = all15.length;

  const distinctContributors15m = new Set(
    inWindow(all15, window15).map((r) => r.user_id).filter((u): u is string => !!u),
  ).size;

  return {
    severity: inc.severity,
    status: inc.status,
    createdAt: new Date(inc.created_at),
    resolvedAt: inc.resolved_at ? new Date(inc.resolved_at) : null,
    events5m,
    events15m,
    distinctContributors15m,
    actionItemsCreated: actionItems.created,
    actionItemsCompleted: actionItems.completed,
    hasProgressedFromOpen: inc.status !== 'open',
    lastEventAt: lastEvent,
    now,
  };
}

async function countSince(
  sql: string,
  tenantId: string,
  incidentId: string,
  now: Date,
): Promise<Array<{ user_id: string | null; created_at: Date }>> {
  const cutoff = new Date(now.getTime() - 15 * 60_000);
  const { rows } = await db.query(sql, [tenantId, incidentId, cutoff]);
  return rows as Array<{ user_id: string | null; created_at: Date }>;
}

/** Same as countSince but tolerates a missing table (older schemas). */
async function countSinceMaybe(
  sql: string, tenantId: string, incidentId: string, now: Date,
): Promise<Array<{ user_id: string | null; created_at: Date }>> {
  try {
    return await countSince(sql, tenantId, incidentId, now);
  } catch {
    return [];
  }
}

async function loadActionItems(
  tenantId: string,
  incidentId: string,
): Promise<{ created: number; completed: number }> {
  try {
    const { rows } = await db.query(
      `SELECT
          COUNT(*)::int                                       AS created,
          COUNT(*) FILTER (WHERE status = 'done')::int        AS completed
        FROM action_items
       WHERE tenant_id = $1 AND incident_id = $2`,
      [tenantId, incidentId],
    );
    const r = rows[0] as { created: number; completed: number } | undefined;
    return { created: r?.created ?? 0, completed: r?.completed ?? 0 };
  } catch {
    return { created: 0, completed: 0 };
  }
}

async function loadLastEventAt(tenantId: string, incidentId: string): Promise<Date | null> {
  const { rows } = await db.query(
    `SELECT MAX(created_at) AS last_at FROM (
        SELECT created_at FROM incident_timeline
         WHERE tenant_id = $1 AND incident_id = $2
        UNION ALL
        SELECT created_at FROM incident_comments
         WHERE tenant_id = $1 AND incident_id = $2
     ) t`,
    [tenantId, incidentId],
  );
  const r = rows[0] as { last_at: Date | null } | undefined;
  return r?.last_at ? new Date(r.last_at) : null;
}

async function persistSnapshot(
  tenantId: string,
  incidentId: string,
  result: MomentumResult,
): Promise<void> {
  try {
    await db.query(
      `INSERT INTO incident_momentum_snapshots (tenant_id, incident_id, score, category, signals)
       VALUES ($1, $2, $3, $4, $5)`,
      [tenantId, incidentId, result.score, result.category, JSON.stringify(result.signals)],
    );
  } catch (e) {
    // Migration 015 may not have been applied yet — degrade silently.
    logger.warn('momentum.snapshot.failed', { error: (e as Error).message, incidentId });
  }
}

/** Writes one timeline entry per stall episode (debounced). */
async function maybeLogStallTimelineEntry(
  tenantId: string,
  incidentId: string,
  result: MomentumResult,
  now: Date,
): Promise<void> {
  const cutoff = new Date(now.getTime() - STALL_REPEAT_GUARD_MIN * 60_000);
  const { rows } = await db.query(
    `SELECT id FROM incident_timeline
      WHERE tenant_id = $1 AND incident_id = $2
        AND action = 'momentum_stall_detected'
        AND created_at >= $3
      LIMIT 1`,
    [tenantId, incidentId, cutoff],
  );
  if (rows.length > 0) return;

  await db.query(
    `INSERT INTO incident_timeline (incident_id, tenant_id, user_id, action, metadata)
     VALUES ($1, $2, NULL, 'momentum_stall_detected', $3)`,
    [
      incidentId,
      tenantId,
      JSON.stringify({
        score: result.score,
        category: result.category,
        reason: result.reason,
        signals: result.signals,
      }),
    ],
  );
}
