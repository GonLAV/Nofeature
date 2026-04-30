/**
 * Blast Radius Forecaster \u2014 service layer.
 *
 *   forecast(incidentId)            \u2014 compute a fresh forecast and persist it
 *   getLatest(incidentId)           \u2014 read the most-recent snapshot (no compute)
 *   getTrajectory(incidentId, n)    \u2014 last N snapshots for sparkline rendering
 *   recordOutcome(incidentId, peak) \u2014 score forecasts vs reality post-resolve
 */

import db from '../../config/database';
import { NotFoundError } from '../../utils/errors';
import {
  forecast,
  FORECAST_SCHEMA_VERSION,
  type ForecastInput,
  type ForecastOutput,
} from './blast.score';

const SAMPLE_WINDOW_MINUTES = 30;
const SAMPLE_LIMIT          = 12;

interface IncidentRow {
  id:                string;
  tenant_id:         string;
  severity:          ForecastInput['severity'];
  affected_systems:  string[] | null;
  created_at:        Date;
  status:            string;
}

interface SignalRow {
  service_count:          string;
  timeline_events_5m:     string;
  comments_5m:            string;
  distinct_status_values: string;
}

interface SampleRow {
  computed_at:    Date;
  current_radius: number;
}

export interface ForecastRecord extends ForecastOutput {
  incidentId:  string;
  computedAt:  Date;
}

export class BlastForecastService {
  async forecast(incidentId: string, tenantId: string): Promise<ForecastRecord> {
    const inc = await this.loadIncident(incidentId, tenantId);
    const sig = await this.loadSignals(incidentId, tenantId);
    const recentSamples = await this.loadRecentSamples(incidentId, tenantId);

    const ageMinutes = Math.max(0, (Date.now() - inc.created_at.getTime()) / 60_000);

    const input: ForecastInput = {
      severity:               inc.severity,
      affectedSystems:        inc.affected_systems?.length ?? 0,
      serviceCount:           Number(sig.service_count)          || 0,
      timelineEventsLast5min: Number(sig.timeline_events_5m)     || 0,
      commentsLast5min:       Number(sig.comments_5m)            || 0,
      distinctStatusValues:   Number(sig.distinct_status_values) || 0,
      ageMinutes,
      recentSamples,
    };

    const out = forecast(input);

    const { rows } = await db.query(
      `INSERT INTO blast_forecasts
         (tenant_id, incident_id,
          current_radius, growth_rate_per_min, projected_radius_30min,
          minutes_to_customer, minutes_to_p1_escalation,
          confidence, inputs, schema_version)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10)
       RETURNING computed_at`,
      [
        tenantId,
        incidentId,
        out.currentRadius,
        out.growthRatePerMin,
        out.projectedRadius30min,
        out.minutesToCustomerImpact,
        out.minutesToP1Escalation,
        out.confidence,
        JSON.stringify({ input, components: out.components }),
        FORECAST_SCHEMA_VERSION,
      ],
    );

    return {
      ...out,
      incidentId,
      computedAt: (rows[0] as { computed_at: Date }).computed_at,
    };
  }

  async getLatest(incidentId: string, tenantId: string): Promise<ForecastRecord | null> {
    const { rows } = await db.query(
      `SELECT computed_at, current_radius, growth_rate_per_min,
              projected_radius_30min, minutes_to_customer, minutes_to_p1_escalation,
              confidence, inputs
         FROM blast_forecasts
        WHERE incident_id = $1 AND tenant_id = $2
        ORDER BY computed_at DESC
        LIMIT 1`,
      [incidentId, tenantId],
    );
    if (rows.length === 0) return null;
    const r = rows[0] as {
      computed_at: Date;
      current_radius: number;
      growth_rate_per_min: number;
      projected_radius_30min: number;
      minutes_to_customer: number | null;
      minutes_to_p1_escalation: number | null;
      confidence: number;
      inputs: { components: ForecastOutput['components'] };
    };
    return {
      incidentId,
      computedAt:              r.computed_at,
      currentRadius:           r.current_radius,
      growthRatePerMin:        r.growth_rate_per_min,
      projectedRadius30min:    r.projected_radius_30min,
      minutesToCustomerImpact: r.minutes_to_customer,
      minutesToP1Escalation:   r.minutes_to_p1_escalation,
      confidence:              r.confidence,
      components:              r.inputs.components,
    };
  }

  async getTrajectory(
    incidentId: string,
    tenantId:   string,
    limit       = 30,
  ): Promise<{ computedAt: Date; radius: number; projected: number }[]> {
    const safeLimit = Math.min(120, Math.max(1, limit));
    const { rows } = await db.query(
      `SELECT computed_at, current_radius, projected_radius_30min
         FROM blast_forecasts
        WHERE incident_id = $1 AND tenant_id = $2
        ORDER BY computed_at DESC
        LIMIT $3`,
      [incidentId, tenantId, safeLimit],
    );
    type R = { computed_at: Date; current_radius: number; projected_radius_30min: number };
    return (rows as R[])
      .map((r) => ({
        computedAt: r.computed_at,
        radius:     r.current_radius,
        projected:  r.projected_radius_30min,
      }))
      .reverse();
  }

  /**
   * Score every forecast for this incident against the actual peak
   * radius. Caller is expected to invoke this from the postmortem
   * pipeline once the incident is resolved.
   */
  async recordOutcome(incidentId: string, tenantId: string, actualPeakRadius: number): Promise<number> {
    const { rowCount } = await db.query(
      `UPDATE blast_forecasts
          SET actual_peak_radius = $3,
              forecast_residual  = $3 - projected_radius_30min
        WHERE incident_id = $1 AND tenant_id = $2`,
      [incidentId, tenantId, actualPeakRadius],
    );
    return rowCount ?? 0;
  }

  /* \u2500\u2500\u2500 helpers \u2500\u2500\u2500 */

  private async loadIncident(incidentId: string, tenantId: string): Promise<IncidentRow> {
    const { rows } = await db.query(
      `SELECT id, tenant_id, severity, affected_systems, created_at, status
         FROM incidents
        WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [incidentId, tenantId],
    );
    if (rows.length === 0) throw new NotFoundError('Incident not found');
    return rows[0] as IncidentRow;
  }

  private async loadSignals(incidentId: string, tenantId: string): Promise<SignalRow> {
    const { rows } = await db.query(
      `SELECT
         (SELECT COUNT(*) FROM incident_services
            WHERE incident_id = $1) AS service_count,
         (SELECT COUNT(*) FROM incident_timeline
            WHERE incident_id = $1
              AND created_at >= NOW() - INTERVAL '5 minutes') AS timeline_events_5m,
         (SELECT COUNT(*) FROM incident_comments
            WHERE incident_id = $1
              AND created_at >= NOW() - INTERVAL '5 minutes') AS comments_5m,
         (SELECT COUNT(DISTINCT (metadata->>'newStatus'))
            FROM incident_timeline
            WHERE incident_id = $1
              AND action = 'status_changed'
              AND metadata ? 'newStatus') AS distinct_status_values`,
      [incidentId],
    );
    void tenantId;
    return rows[0] as SignalRow;
  }

  private async loadRecentSamples(
    incidentId: string,
    tenantId:   string,
  ): Promise<{ capturedAt: Date; radius: number }[]> {
    const { rows } = await db.query(
      `SELECT computed_at, current_radius
         FROM blast_forecasts
        WHERE incident_id = $1 AND tenant_id = $2
          AND computed_at >= NOW() - INTERVAL '${SAMPLE_WINDOW_MINUTES} minutes'
        ORDER BY computed_at DESC
        LIMIT ${SAMPLE_LIMIT}`,
      [incidentId, tenantId],
    );
    return (rows as SampleRow[])
      .map((r) => ({ capturedAt: r.computed_at, radius: r.current_radius }))
      .reverse();
  }
}
