import db from '../../config/database';
import { NotFoundError } from '../../utils/errors';
import {
  CONFIDENCE_SCHEMA_VERSION,
  summariseConfidence,
  type ConfidencePoint,
  type ConfidenceGradientStats,
} from './confidence.score';

const MAX_READINGS = 5_000;

export interface ConfidenceReadingRow {
  id:          string;
  incidentId:  string;
  readerId:    string;
  confidence:  number;
  note:        string | null;
  recordedAt:  Date;
}

interface DbRow {
  id:           string;
  incident_id:  string;
  reader_id:    string;
  confidence:   string;     // numeric arrives as string from pg
  note:         string | null;
  recorded_at:  Date;
}

const mapRow = (r: DbRow): ConfidenceReadingRow => ({
  id:         r.id,
  incidentId: r.incident_id,
  readerId:   r.reader_id,
  confidence: Number(r.confidence),
  note:       r.note,
  recordedAt: r.recorded_at,
});

export class ConfidenceService {
  private async ensureIncident(tenantId: string, incidentId: string): Promise<void> {
    const r = await db.query(
      `SELECT 1 FROM incidents WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [incidentId, tenantId],
    );
    if (r.rows.length === 0) {
      throw new NotFoundError('Incident not found');
    }
  }

  async record(opts: {
    tenantId:   string;
    userId:     string;
    incidentId: string;
    confidence: number;
    note?:      string;
  }): Promise<ConfidenceReadingRow> {
    await this.ensureIncident(opts.tenantId, opts.incidentId);
    const { rows } = await db.query(
      `INSERT INTO confidence_readings
         (tenant_id, incident_id, reader_id, confidence, note)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, incident_id, reader_id, confidence, note, recorded_at`,
      [opts.tenantId, opts.incidentId, opts.userId, opts.confidence, opts.note ?? null],
    );
    await db.query(
      `INSERT INTO audit_logs (tenant_id, user_id, action, resource, resource_id, metadata)
       VALUES ($1, $2, 'confidence.record', 'incident', $3, $4::jsonb)`,
      [
        opts.tenantId,
        opts.userId,
        opts.incidentId,
        JSON.stringify({ confidence: opts.confidence, schemaVersion: CONFIDENCE_SCHEMA_VERSION }),
      ],
    );
    return mapRow(rows[0] as DbRow);
  }

  async list(opts: { tenantId: string; incidentId: string }): Promise<ConfidenceReadingRow[]> {
    await this.ensureIncident(opts.tenantId, opts.incidentId);
    const { rows } = await db.query(
      `SELECT id, incident_id, reader_id, confidence, note, recorded_at
         FROM confidence_readings
        WHERE incident_id = $1 AND tenant_id = $2
        ORDER BY recorded_at ASC
        LIMIT $3`,
      [opts.incidentId, opts.tenantId, MAX_READINGS],
    );
    return (rows as DbRow[]).map(mapRow);
  }

  async stats(opts: {
    tenantId:      string;
    incidentId:    string;
    dropThreshold: number;
  }): Promise<ConfidenceGradientStats> {
    const readings = await this.list({ tenantId: opts.tenantId, incidentId: opts.incidentId });
    const points: ConfidencePoint[] = readings.map((r) => ({
      recordedAt: r.recordedAt,
      confidence: r.confidence,
    }));
    return summariseConfidence(points, { dropThreshold: opts.dropThreshold });
  }
}
