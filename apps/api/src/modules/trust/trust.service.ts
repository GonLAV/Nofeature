/**
 * Trust Decay Monitor \u2014 service layer.
 *
 *   computeAll(incidentId)         compute pulses for all 3 audiences and persist
 *   getLatestAll(incidentId)       most-recent pulse per audience
 *   getAudienceTrajectory(...)     last N pulses for one audience (sparkline)
 */

import db from '../../config/database';
import { NotFoundError } from '../../utils/errors';
import {
  scorePulse,
  blendBaseline,
  TRUST_SCHEMA_VERSION,
  type Audience,
  type Severity,
  type PulseOutput,
} from './trust.score';

const AUDIENCES: Audience[] = ['customers', 'internal', 'exec'];

const BASELINE_WINDOW_DAYS = 60;
const BASELINE_SAMPLE_CAP  = 50;

export interface PulseRecord extends PulseOutput {
  incidentId:       string;
  audience:         Audience;
  computedAt:       Date;
  gapMinutes:       number;
  baselineMinutes:  number;
}

interface IncidentRow {
  id:         string;
  tenant_id:  string;
  severity:   Severity;
  created_at: Date;
}

export class TrustDecayService {
  async computeAll(incidentId: string, tenantId: string): Promise<PulseRecord[]> {
    const inc = await this.loadIncident(incidentId, tenantId);
    const out: PulseRecord[] = [];
    for (const audience of AUDIENCES) {
      out.push(await this.computeOne(inc, audience));
    }
    return out;
  }

  async getLatestAll(incidentId: string, tenantId: string): Promise<PulseRecord[]> {
    const { rows } = await db.query(
      `SELECT DISTINCT ON (audience)
              audience, computed_at, gap_minutes, baseline_minutes,
              trust_score, minutes_to_trust_loss
         FROM trust_pulses
        WHERE incident_id = $1 AND tenant_id = $2
        ORDER BY audience, computed_at DESC`,
      [incidentId, tenantId],
    );
    type R = {
      audience: Audience; computed_at: Date;
      gap_minutes: number; baseline_minutes: number;
      trust_score: number; minutes_to_trust_loss: number | null;
    };
    return (rows as R[]).map((r) => ({
      incidentId,
      audience:           r.audience,
      computedAt:         r.computed_at,
      gapMinutes:         r.gap_minutes,
      baselineMinutes:    r.baseline_minutes,
      trustScore:         r.trust_score,
      ratio:              r.gap_minutes / Math.max(0.5, r.baseline_minutes),
      minutesToTrustLoss: r.minutes_to_trust_loss,
    }));
  }

  async getAudienceTrajectory(
    incidentId: string,
    tenantId:   string,
    audience:   Audience,
    limit       = 30,
  ): Promise<{ computedAt: Date; trustScore: number; gapMinutes: number }[]> {
    const safe = Math.min(120, Math.max(1, limit));
    const { rows } = await db.query(
      `SELECT computed_at, trust_score, gap_minutes
         FROM trust_pulses
        WHERE incident_id = $1 AND tenant_id = $2 AND audience = $3
        ORDER BY computed_at DESC
        LIMIT $4`,
      [incidentId, tenantId, audience, safe],
    );
    type R = { computed_at: Date; trust_score: number; gap_minutes: number };
    return (rows as R[])
      .map((r) => ({
        computedAt: r.computed_at,
        trustScore: r.trust_score,
        gapMinutes: r.gap_minutes,
      }))
      .reverse();
  }

  /* \u2500\u2500\u2500 internals \u2500\u2500\u2500 */

  private async computeOne(inc: IncidentRow, audience: Audience): Promise<PulseRecord> {
    const lastUpdate     = await this.loadLastUpdate(inc.id, audience);
    const since          = lastUpdate ?? inc.created_at;
    const gapMinutes     = Math.max(0, (Date.now() - since.getTime()) / 60_000);

    const samples        = await this.loadBaselineSamples(inc.tenant_id, audience, inc.severity);
    const baselineMinutes = blendBaseline(audience, inc.severity, samples);

    const result = scorePulse({
      audience,
      severity: inc.severity,
      gapMinutes,
      baselineMinutes,
    });

    const { rows } = await db.query(
      `INSERT INTO trust_pulses
         (tenant_id, incident_id, audience,
          gap_minutes, baseline_minutes, trust_score, minutes_to_trust_loss,
          inputs, schema_version)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)
       RETURNING computed_at`,
      [
        inc.tenant_id,
        inc.id,
        audience,
        gapMinutes,
        baselineMinutes,
        result.trustScore,
        result.minutesToTrustLoss,
        JSON.stringify({
          severity:        inc.severity,
          ratio:           result.ratio,
          baselineSources: samples.length,
          lastUpdateAt:    lastUpdate ? lastUpdate.toISOString() : null,
        }),
        TRUST_SCHEMA_VERSION,
      ],
    );

    return {
      incidentId:         inc.id,
      audience,
      computedAt:         (rows[0] as { computed_at: Date }).computed_at,
      gapMinutes,
      baselineMinutes,
      trustScore:         result.trustScore,
      ratio:              result.ratio,
      minutesToTrustLoss: result.minutesToTrustLoss,
    };
  }

  private async loadIncident(incidentId: string, tenantId: string): Promise<IncidentRow> {
    const { rows } = await db.query(
      `SELECT id, tenant_id, severity, created_at
         FROM incidents
        WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [incidentId, tenantId],
    );
    if (rows.length === 0) throw new NotFoundError('Incident not found');
    return rows[0] as IncidentRow;
  }

  /**
   * The most recent timestamp at which `audience` last "heard" something.
   *
   *   customers  \u2192 last public (non-internal) comment, else any status_changed
   *   internal   \u2192 last timeline event (any action) or any comment
   *   exec       \u2192 last status_changed or commander_assigned timeline event
   */
  private async loadLastUpdate(incidentId: string, audience: Audience): Promise<Date | null> {
    let query: string;
    switch (audience) {
      case 'customers':
        query = `
          SELECT MAX(t) AS t FROM (
            SELECT MAX(created_at) AS t FROM incident_comments
              WHERE incident_id = $1 AND is_internal = FALSE
            UNION ALL
            SELECT MAX(created_at) AS t FROM incident_timeline
              WHERE incident_id = $1 AND action = 'status_changed'
          ) src`;
        break;
      case 'internal':
        query = `
          SELECT MAX(t) AS t FROM (
            SELECT MAX(created_at) AS t FROM incident_timeline
              WHERE incident_id = $1
            UNION ALL
            SELECT MAX(created_at) AS t FROM incident_comments
              WHERE incident_id = $1
          ) src`;
        break;
      case 'exec':
        query = `
          SELECT MAX(created_at) AS t FROM incident_timeline
            WHERE incident_id = $1
              AND action IN ('status_changed','commander_assigned','severity_changed')`;
        break;
    }
    const { rows } = await db.query(query, [incidentId]);
    const t = (rows[0] as { t: Date | null } | undefined)?.t ?? null;
    return t;
  }

  /**
   * Historical median-ish gap for this (audience, severity) over the
   * last BASELINE_WINDOW_DAYS days. Cheap MVP: read the per-incident
   * average gap between consecutive timeline updates.
   */
  private async loadBaselineSamples(
    tenantId: string,
    audience: Audience,
    severity: Severity,
  ): Promise<number[]> {
    // We approximate the "baseline cadence" as the mean inter-event
    // gap on resolved incidents of the same severity. This avoids an
    // extra audit table and degrades gracefully when there isn't much
    // history yet (the prior in `blendBaseline` covers the gap).
    const actionsForAudience: Record<Audience, string> = {
      customers: `action IN ('status_changed') OR (kind = 'comment' AND is_internal = FALSE)`,
      internal:  `TRUE`,
      exec:      `action IN ('status_changed','commander_assigned','severity_changed')`,
    };
    const filter = actionsForAudience[audience];

    const { rows } = await db.query(
      `WITH events AS (
         SELECT incident_id, created_at, action, NULL::boolean AS is_internal, 'timeline'::text AS kind
           FROM incident_timeline
          WHERE tenant_id = $1
            AND created_at >= NOW() - INTERVAL '${BASELINE_WINDOW_DAYS} days'
         UNION ALL
         SELECT incident_id, created_at, NULL::text AS action, is_internal, 'comment'::text AS kind
           FROM incident_comments
          WHERE tenant_id = $1
            AND created_at >= NOW() - INTERVAL '${BASELINE_WINDOW_DAYS} days'
       ),
       filtered AS (
         SELECT e.incident_id, e.created_at
           FROM events e
           JOIN incidents i
             ON i.id = e.incident_id
            AND i.tenant_id = $1
            AND i.severity  = $2
            AND i.resolved_at IS NOT NULL
          WHERE ${filter}
       ),
       gaps AS (
         SELECT incident_id,
                EXTRACT(EPOCH FROM (created_at - LAG(created_at)
                  OVER (PARTITION BY incident_id ORDER BY created_at))) / 60.0 AS gap_min
           FROM filtered
       )
       SELECT AVG(gap_min)::float AS avg_gap
         FROM gaps
        WHERE gap_min IS NOT NULL AND gap_min > 0
        GROUP BY incident_id
        LIMIT ${BASELINE_SAMPLE_CAP}`,
      [tenantId, severity],
    );
    type R = { avg_gap: number | null };
    return (rows as R[]).map((r) => r.avg_gap ?? 0).filter((n) => n > 0);
  }
}
