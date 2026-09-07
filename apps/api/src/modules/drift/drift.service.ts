import db from '../../config/database';
import { NotFoundError } from '../../utils/errors';
import {
  DRIFT_SCHEMA_VERSION,
  textDriftMagnitude,
  severityDriftMagnitude,
  tagsDriftMagnitude,
  summariseDrift,
  type DriftEvent,
  type DriftField,
  type DriftSummary,
} from './drift.score';

const FIELDS: DriftField[] = ['title', 'description', 'severity', 'affected_systems'];
const MAX_EVENTS = 5_000;

export interface DriftEventRow {
  id:            string;
  incidentId:    string;
  field:         DriftField;
  previousValue: unknown;
  nextValue:     unknown;
  magnitude:     number;
  createdAt:     Date;
}

interface IncidentSnapshot {
  title:            string;
  description:      string;
  severity:         string;
  affected_systems: string[];
}

const computeMagnitude = (
  field: DriftField,
  prev: unknown,
  next: unknown,
): number => {
  switch (field) {
    case 'title':
    case 'description':
      return textDriftMagnitude(String(prev ?? ''), String(next ?? ''));
    case 'severity':
      return severityDriftMagnitude(String(prev ?? ''), String(next ?? ''));
    case 'affected_systems':
      return tagsDriftMagnitude(
        Array.isArray(prev) ? (prev as string[]) : [],
        Array.isArray(next) ? (next as string[]) : [],
      );
  }
};

const valuesEqual = (a: unknown, b: unknown): boolean => {
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    const A = [...a].map(String).sort();
    const B = [...b].map(String).sort();
    return A.every((x, i) => x === B[i]);
  }
  return a === b || (a == null && b == null);
};

export class DriftService {
  private async loadIncident(tenantId: string, incidentId: string): Promise<IncidentSnapshot> {
    const r = await db.query(
      `SELECT title, description, severity, affected_systems
         FROM incidents
        WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [incidentId, tenantId],
    );
    if (r.rows.length === 0) throw new NotFoundError('Incident not found');
    const row = r.rows[0];
    return {
      title:            row.title ?? '',
      description:      row.description ?? '',
      severity:         row.severity ?? '',
      affected_systems: row.affected_systems ?? [],
    };
  }

  /**
   * Record drift events for any field whose current value differs from the
   * most recently recorded `next_value`. Self-bootstrapping: the first sync
   * per field records a baseline event with magnitude=0 so future deltas
   * have something to diff against.
   */
  async sync(opts: { tenantId: string; incidentId: string; actorId?: string }): Promise<DriftEventRow[]> {
    const current = await this.loadIncident(opts.tenantId, opts.incidentId);
    const created: DriftEventRow[] = [];

    for (const field of FIELDS) {
      const latest = await db.query(
        `SELECT next_value
           FROM incident_drift_events
          WHERE incident_id = $1 AND field = $2
          ORDER BY created_at DESC
          LIMIT 1`,
        [opts.incidentId, field],
      );

      const currentValue = (current as any)[field];
      let prevValue: unknown = null;
      let magnitude = 0;
      if (latest.rows.length === 0) {
        // First time we've ever observed this field — record a baseline.
        prevValue = null;
        magnitude = 0;
      } else {
        prevValue = latest.rows[0].next_value;
        if (valuesEqual(prevValue, currentValue)) continue;
        magnitude = computeMagnitude(field, prevValue, currentValue);
      }

      const ins = await db.query(
        `INSERT INTO incident_drift_events
           (tenant_id, incident_id, actor_id, field, previous_value, next_value, magnitude)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7)
         RETURNING id, incident_id, field, previous_value, next_value, magnitude, created_at`,
        [
          opts.tenantId,
          opts.incidentId,
          opts.actorId ?? null,
          field,
          prevValue === null ? null : JSON.stringify(prevValue),
          JSON.stringify(currentValue),
          magnitude,
        ],
      );
      const row = ins.rows[0];
      created.push({
        id:            row.id,
        incidentId:    row.incident_id,
        field:         row.field,
        previousValue: row.previous_value,
        nextValue:     row.next_value,
        magnitude:     Number(row.magnitude),
        createdAt:     row.created_at,
      });
    }

    if (created.length > 0) {
      await db.query(
        `INSERT INTO audit_logs (tenant_id, user_id, action, resource, resource_id, metadata)
         VALUES ($1, $2, 'drift.sync', 'incident', $3, $4::jsonb)`,
        [
          opts.tenantId,
          opts.actorId ?? null,
          opts.incidentId,
          JSON.stringify({
            schemaVersion: DRIFT_SCHEMA_VERSION,
            recorded: created.length,
          }),
        ],
      );
    }
    return created;
  }

  async list(opts: { tenantId: string; incidentId: string }): Promise<DriftEventRow[]> {
    const r = await db.query(
      `SELECT id, incident_id, field, previous_value, next_value, magnitude, created_at
         FROM incident_drift_events
        WHERE tenant_id = $1 AND incident_id = $2
        ORDER BY created_at ASC
        LIMIT $3`,
      [opts.tenantId, opts.incidentId, MAX_EVENTS],
    );
    return r.rows.map((row: any) => ({
      id:            row.id,
      incidentId:    row.incident_id,
      field:         row.field,
      previousValue: row.previous_value,
      nextValue:     row.next_value,
      magnitude:     Number(row.magnitude),
      createdAt:     row.created_at,
    }));
  }

  async stats(opts: {
    tenantId:        string;
    incidentId:      string;
    halfLifeMinutes: number;
  }): Promise<DriftSummary> {
    const events = await this.list({ tenantId: opts.tenantId, incidentId: opts.incidentId });
    const driftEvents: DriftEvent[] = events
      .filter((e) => e.magnitude > 0)
      .map((e) => ({ field: e.field, magnitude: e.magnitude, createdAt: e.createdAt }));
    return summariseDrift(driftEvents, { halfLifeMinutes: opts.halfLifeMinutes });
  }

  /** Top-N most-drifted active incidents in the tenant within the window. */
  async topDrifting(opts: {
    tenantId:        string;
    halfLifeMinutes: number;
    limit:           number;
    windowDays:      number;
  }): Promise<Array<{
    incidentId: string;
    title:      string;
    severity:   string;
    status:     string;
    summary:    DriftSummary;
  }>> {
    const r = await db.query(
      `SELECT DISTINCT i.id AS incident_id, i.title, i.severity, i.status
         FROM incidents i
         JOIN incident_drift_events d ON d.incident_id = i.id
        WHERE i.tenant_id = $1
          AND i.deleted_at IS NULL
          AND i.status IN ('open','investigating')
          AND d.created_at >= NOW() - make_interval(days => $2::int)`,
      [opts.tenantId, opts.windowDays],
    );

    const out: Array<{ incidentId: string; title: string; severity: string; status: string; summary: DriftSummary }> = [];
    for (const row of r.rows) {
      const summary = await this.stats({
        tenantId:        opts.tenantId,
        incidentId:      row.incident_id,
        halfLifeMinutes: opts.halfLifeMinutes,
      });
      out.push({
        incidentId: row.incident_id,
        title:      row.title,
        severity:   row.severity,
        status:     row.status,
        summary,
      });
    }

    return out
      .sort((a, b) => b.summary.driftIndex - a.summary.driftIndex)
      .slice(0, opts.limit);
  }
}
