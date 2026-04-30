/**
 * Resolution Convergence Index \u2014 service layer.
 */

import db from '../../config/database';
import { NotFoundError } from '../../utils/errors';
import {
  score as scoreConvergence,
  CONVERGENCE_SCHEMA_VERSION,
  type ConvergenceInput,
  type ConvergenceOutput,
  type Diagnosis,
} from './convergence.score';

const RECENT_WINDOW_MIN = 10;

export interface ConvergenceRecord extends ConvergenceOutput {
  incidentId: string;
  computedAt: Date;
}

interface IncidentRow {
  id:         string;
  tenant_id:  string;
  created_at: Date;
}

interface SignalRow {
  recent_action_events:    string;
  recent_discussion_events:string;
  recent_comments:         string;
  total_systems:           string;
  recent_systems:          string;
  status_reversals:        string;
}

export class ConvergenceService {
  async compute(incidentId: string, tenantId: string): Promise<ConvergenceRecord> {
    const inc    = await this.loadIncident(incidentId, tenantId);
    const signal = await this.loadSignals(incidentId);
    const prior  = await this.loadPrior(incidentId, tenantId);

    const ageMinutes = Math.max(0, (Date.now() - inc.created_at.getTime()) / 60_000);
    const priorAgeMin = prior
      ? Math.max(0, (Date.now() - prior.computedAt.getTime()) / 60_000)
      : undefined;

    // For events list we just hand the score function the synthesised
    // counts; the function only consumes counts via filter() so we
    // pre-bucket here to save the round-trip.
    const recentEvents: { action: string; at: Date }[] = [
      ...Array.from({ length: Number(signal.recent_action_events)     || 0 }, () => ({ action: 'status_changed', at: new Date() })),
      ...Array.from({ length: Number(signal.recent_discussion_events) || 0 }, () => ({ action: 'comment',         at: new Date() })),
    ];

    const input: ConvergenceInput = {
      recentEvents,
      recentComments:        Number(signal.recent_comments)        || 0,
      distinctSystemsTotal:  Number(signal.total_systems)          || 0,
      distinctSystemsRecent: Number(signal.recent_systems)         || 0,
      statusReversals:       Number(signal.status_reversals)       || 0,
      ageMinutes,
      recentWindowMinutes:   RECENT_WINDOW_MIN,
      priorScore:            prior?.score,
      priorAgeMinutes:       priorAgeMin,
      priorStuckMinutes:     prior?.stuckMinutes,
    };

    const out = scoreConvergence(input);

    const { rows } = await db.query(
      `INSERT INTO convergence_scores
         (tenant_id, incident_id,
          score, diagnosis, velocity_per_min, minutes_to_resolution,
          stuck_minutes, signals, schema_version)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)
       RETURNING computed_at`,
      [
        tenantId,
        incidentId,
        out.score,
        out.diagnosis,
        out.velocityPerMin,
        out.minutesToResolution,
        out.stuckMinutes,
        JSON.stringify({ components: out.components, ageMinutes }),
        CONVERGENCE_SCHEMA_VERSION,
      ],
    );

    return {
      ...out,
      incidentId,
      computedAt: (rows[0] as { computed_at: Date }).computed_at,
    };
  }

  async getLatest(incidentId: string, tenantId: string): Promise<ConvergenceRecord | null> {
    const { rows } = await db.query(
      `SELECT computed_at, score, diagnosis, velocity_per_min,
              minutes_to_resolution, stuck_minutes, signals
         FROM convergence_scores
        WHERE incident_id = $1 AND tenant_id = $2
        ORDER BY computed_at DESC
        LIMIT 1`,
      [incidentId, tenantId],
    );
    if (rows.length === 0) return null;
    type R = {
      computed_at: Date; score: number; diagnosis: Diagnosis;
      velocity_per_min: number; minutes_to_resolution: number | null;
      stuck_minutes: number; signals: { components: ConvergenceOutput['components'] };
    };
    const r = rows[0] as R;
    return {
      incidentId,
      computedAt:           r.computed_at,
      score:                r.score,
      diagnosis:            r.diagnosis,
      velocityPerMin:       r.velocity_per_min,
      minutesToResolution:  r.minutes_to_resolution,
      stuckMinutes:         r.stuck_minutes,
      components:           r.signals.components,
    };
  }

  async getTrajectory(
    incidentId: string,
    tenantId:   string,
    limit       = 30,
  ): Promise<{ computedAt: Date; score: number; diagnosis: Diagnosis }[]> {
    const safe = Math.min(120, Math.max(1, limit));
    const { rows } = await db.query(
      `SELECT computed_at, score, diagnosis
         FROM convergence_scores
        WHERE incident_id = $1 AND tenant_id = $2
        ORDER BY computed_at DESC
        LIMIT $3`,
      [incidentId, tenantId, safe],
    );
    type R = { computed_at: Date; score: number; diagnosis: Diagnosis };
    return (rows as R[])
      .map((r) => ({ computedAt: r.computed_at, score: r.score, diagnosis: r.diagnosis }))
      .reverse();
  }

  /** Score forecasts vs reality once an incident resolves. */
  async recordOutcome(incidentId: string, tenantId: string, actualMinutesToResolve: number): Promise<number> {
    const { rowCount } = await db.query(
      `UPDATE convergence_scores
          SET actual_minutes_to_resolve = $3,
              resolution_residual       = $3 - COALESCE(minutes_to_resolution, $3)
        WHERE incident_id = $1 AND tenant_id = $2`,
      [incidentId, tenantId, actualMinutesToResolve],
    );
    return rowCount ?? 0;
  }

  /* \u2500\u2500\u2500 internals \u2500\u2500\u2500 */

  private async loadIncident(incidentId: string, tenantId: string): Promise<IncidentRow> {
    const { rows } = await db.query(
      `SELECT id, tenant_id, created_at
         FROM incidents
        WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [incidentId, tenantId],
    );
    if (rows.length === 0) throw new NotFoundError('Incident not found');
    return rows[0] as IncidentRow;
  }

  private async loadSignals(incidentId: string): Promise<SignalRow> {
    const { rows } = await db.query(
      `SELECT
         (SELECT COUNT(*) FROM incident_timeline
            WHERE incident_id = $1
              AND created_at >= NOW() - INTERVAL '${RECENT_WINDOW_MIN} minutes'
              AND action IN ('status_changed','commander_assigned','severity_changed','mitigation_applied','mitigation_attempted'))
              AS recent_action_events,

         (SELECT COUNT(*) FROM incident_timeline
            WHERE incident_id = $1
              AND created_at >= NOW() - INTERVAL '${RECENT_WINDOW_MIN} minutes'
              AND action IN ('hypothesis_added','note_added'))
              AS recent_discussion_events,

         (SELECT COUNT(*) FROM incident_comments
            WHERE incident_id = $1
              AND created_at >= NOW() - INTERVAL '${RECENT_WINDOW_MIN} minutes')
              AS recent_comments,

         (SELECT COUNT(DISTINCT service_id) FROM incident_services
            WHERE incident_id = $1)
              AS total_systems,

         (SELECT COUNT(DISTINCT service_id) FROM incident_services
            WHERE incident_id = $1
              AND created_at >= NOW() - INTERVAL '${RECENT_WINDOW_MIN} minutes')
              AS recent_systems,

         (SELECT COUNT(*) FROM (
            SELECT metadata->>'newStatus' AS s,
                   LAG(metadata->>'newStatus') OVER (ORDER BY created_at) AS prev_s
              FROM incident_timeline
             WHERE incident_id = $1 AND action = 'status_changed'
          ) t WHERE prev_s IS NOT NULL AND prev_s = s) AS status_reversals`,
      [incidentId],
    );
    return rows[0] as SignalRow;
  }

  private async loadPrior(
    incidentId: string,
    tenantId:   string,
  ): Promise<{ score: number; stuckMinutes: number; computedAt: Date } | null> {
    const { rows } = await db.query(
      `SELECT score, stuck_minutes, computed_at
         FROM convergence_scores
        WHERE incident_id = $1 AND tenant_id = $2
        ORDER BY computed_at DESC
        LIMIT 1`,
      [incidentId, tenantId],
    );
    if (rows.length === 0) return null;
    const r = rows[0] as { score: number; stuck_minutes: number; computed_at: Date };
    return { score: r.score, stuckMinutes: r.stuck_minutes, computedAt: r.computed_at };
  }
}
