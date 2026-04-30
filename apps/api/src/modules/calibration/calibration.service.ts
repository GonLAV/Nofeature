import db from '../../config/database';
import { logger } from '../../utils/logger';
import { NotFoundError, ValidationError } from '../../utils/errors';
import {
  CALIBRATION_SCHEMA_VERSION,
  summarise,
  type CalibrationReport,
  type ResolvedPrediction,
} from './calibration.score';

/**
 * Cap how many predictions we pull into memory for a single calibration
 * report. Beyond this we sample the most recent — calibration trends are
 * stable on tens of thousands of points and a single user almost never
 * approaches this limit.
 */
const MAX_REPORT_ROWS = 10_000;

export interface PredictionRow {
  id:               string;
  tenantId:         string;
  incidentId:       string;
  userId:           string;
  statement:        string;
  category:         string;
  confidence:       number;
  resolvedCorrect:  boolean | null;
  resolvedAt:       Date | null;
  resolvedBy:       string | null;
  resolutionNote:   string | null;
  schemaVersion:    number;
  createdAt:        Date;
  updatedAt:        Date;
}

interface DbPredictionRow {
  id:               string;
  tenant_id:        string;
  incident_id:      string;
  user_id:          string;
  statement:        string;
  category:         string;
  confidence:       number | string;
  resolved_correct: boolean | null;
  resolved_at:      Date | null;
  resolved_by:      string | null;
  resolution_note:  string | null;
  schema_version:   number;
  created_at:       Date;
  updated_at:       Date;
}

const toRow = (r: DbPredictionRow): PredictionRow => ({
  id:               r.id,
  tenantId:         r.tenant_id,
  incidentId:       r.incident_id,
  userId:           r.user_id,
  statement:        r.statement,
  category:         r.category,
  confidence:       Number(r.confidence),
  resolvedCorrect:  r.resolved_correct,
  resolvedAt:       r.resolved_at,
  resolvedBy:       r.resolved_by,
  resolutionNote:   r.resolution_note,
  schemaVersion:    r.schema_version,
  createdAt:        r.created_at,
  updatedAt:        r.updated_at,
});

const writeAudit = (
  tenantId: string,
  userId: string,
  action: string,
  resourceId: string,
  metadata: Record<string, unknown> = {},
): Promise<void> =>
  db.query(
    `INSERT INTO audit_logs (tenant_id, user_id, action, resource, resource_id, metadata)
     VALUES ($1,$2,$3,'calibration_prediction',$4,$5::jsonb)`,
    [tenantId, userId, action, resourceId, JSON.stringify(metadata)],
  ).then(() => undefined);

export class CalibrationService {
  async create(opts: {
    tenantId:    string;
    actorId:     string;
    incidentId:  string;
    statement:   string;
    category:    string;
    confidence:  number;
  }): Promise<PredictionRow> {
    // Verify incident scoping before insert — defends against cross-tenant ID guessing.
    const inc = await db.query(
      `SELECT 1 FROM incidents
        WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [opts.incidentId, opts.tenantId],
    );
    if (inc.rowCount === 0) {
      throw new ValidationError({ incidentId: ['Incident not found in this tenant'] });
    }

    const { rows } = await db.query(
      `INSERT INTO calibration_predictions
         (tenant_id, incident_id, user_id, statement, category, confidence)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        opts.tenantId, opts.incidentId, opts.actorId,
        opts.statement, opts.category, opts.confidence,
      ],
    );

    logger.info('calibration.created', {
      tenantId: opts.tenantId, id: rows[0].id, actorId: opts.actorId,
      category: opts.category, confidence: opts.confidence,
    });
    await writeAudit(opts.tenantId, opts.actorId, 'calibration.created', rows[0].id, {
      incidentId: opts.incidentId, category: opts.category, confidence: opts.confidence,
    });

    return toRow(rows[0]);
  }

  async resolve(opts: {
    tenantId:       string;
    actorId:        string;
    id:             string;
    correct:        boolean;
    resolutionNote?: string;
  }): Promise<PredictionRow> {
    return db.transaction(async (client) => {
      const locked = await client.query(
        `SELECT * FROM calibration_predictions
          WHERE id = $1 AND tenant_id = $2
          FOR UPDATE`,
        [opts.id, opts.tenantId],
      );
      if (locked.rowCount === 0) {
        throw new NotFoundError('Prediction not found');
      }
      if (locked.rows[0].resolved_correct !== null) {
        throw new ValidationError({ id: ['Prediction already resolved'] });
      }

      const { rows } = await client.query(
        `UPDATE calibration_predictions
            SET resolved_correct = $1,
                resolved_at      = NOW(),
                resolved_by      = $2,
                resolution_note  = $3,
                updated_at       = NOW()
          WHERE id = $4 AND tenant_id = $5
          RETURNING *`,
        [opts.correct, opts.actorId, opts.resolutionNote ?? null, opts.id, opts.tenantId],
      );

      logger.info('calibration.resolved', {
        tenantId: opts.tenantId, id: opts.id, actorId: opts.actorId,
        correct: opts.correct,
      });
      await writeAudit(opts.tenantId, opts.actorId, 'calibration.resolved', opts.id, {
        correct: opts.correct,
      });

      return toRow(rows[0]);
    });
  }

  async list(
    tenantId: string,
    filter: {
      incidentId?: string;
      userId?:     string;
      category?:   string;
      resolved?:   'true' | 'false';
      limit:       number;
    },
  ): Promise<PredictionRow[]> {
    const conds: string[] = ['tenant_id = $1'];
    const vals: unknown[] = [tenantId];
    let i = 2;

    if (filter.incidentId) { conds.push(`incident_id = $${i++}`); vals.push(filter.incidentId); }
    if (filter.userId)     { conds.push(`user_id = $${i++}`);     vals.push(filter.userId); }
    if (filter.category)   { conds.push(`category = $${i++}`);    vals.push(filter.category); }
    if (filter.resolved === 'true')  conds.push('resolved_correct IS NOT NULL');
    if (filter.resolved === 'false') conds.push('resolved_correct IS NULL');

    const limit = Math.min(500, Math.max(1, filter.limit));
    vals.push(limit);

    const { rows } = await db.query(
      `SELECT * FROM calibration_predictions
        WHERE ${conds.join(' AND ')}
        ORDER BY created_at DESC
        LIMIT $${i}`,
      vals,
    );
    return rows.map(toRow);
  }

  async getById(tenantId: string, id: string): Promise<PredictionRow> {
    const { rows } = await db.query(
      `SELECT * FROM calibration_predictions WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );
    if (rows.length === 0) throw new NotFoundError('Prediction not found');
    return toRow(rows[0]);
  }

  /**
   * Compute a calibration report. Filters by user/category/window are pushed
   * down into SQL so we never load the full table into memory.
   */
  async report(opts: {
    tenantId:    string;
    userId?:     string;
    category?:   string;
    binCount:    number;
    windowDays:  number;
  }): Promise<CalibrationReport> {
    const conds: string[] = [
      'tenant_id = $1',
      'resolved_correct IS NOT NULL',
      'created_at >= NOW() - make_interval(days => $2::int)',
    ];
    const vals: unknown[] = [opts.tenantId, opts.windowDays];
    let i = 3;

    if (opts.userId)   { conds.push(`user_id = $${i++}`);  vals.push(opts.userId); }
    if (opts.category) { conds.push(`category = $${i++}`); vals.push(opts.category); }

    vals.push(MAX_REPORT_ROWS);

    const { rows } = await db.query(
      `SELECT confidence, resolved_correct
         FROM calibration_predictions
        WHERE ${conds.join(' AND ')}
        ORDER BY created_at DESC
        LIMIT $${i}`,
      vals,
    );
    const points: ResolvedPrediction[] = rows.map((r: { confidence: number | string; resolved_correct: boolean }) => ({
      confidence: Number(r.confidence),
      correct:    Boolean(r.resolved_correct),
    }));
    return summarise(points, opts.binCount);
  }

  /**
   * Per-user calibration leaderboard. SQL aggregates the raw counts; we
   * compute Brier and the calibration index in JS using the helper module.
   */
  async leaderboard(opts: {
    tenantId:   string;
    windowDays: number;
    binCount:   number;
  }): Promise<Array<{
    userId:           string;
    userName:         string | null;
    total:            number;
    brier:            number;
    calibrationIndex: number;
  }>> {
    const { rows } = await db.query(
      `SELECT p.user_id, u.name AS user_name, p.confidence, p.resolved_correct
         FROM calibration_predictions p
         LEFT JOIN users u ON u.id = p.user_id AND u.tenant_id = p.tenant_id
        WHERE p.tenant_id = $1
          AND p.resolved_correct IS NOT NULL
          AND p.created_at >= NOW() - make_interval(days => $2::int)
        LIMIT $3`,
      [opts.tenantId, opts.windowDays, MAX_REPORT_ROWS],
    );

    const byUser = new Map<string, {
      name: string | null;
      points: ResolvedPrediction[];
    }>();
    for (const r of rows) {
      const slot = byUser.get(r.user_id) ?? { name: r.user_name as string | null, points: [] as ResolvedPrediction[] };
      slot.points.push({ confidence: Number(r.confidence), correct: Boolean(r.resolved_correct) });
      byUser.set(r.user_id, slot);
    }

    const out: Array<{
      userId: string; userName: string | null;
      total: number; brier: number; calibrationIndex: number;
    }> = [];
    for (const [userId, slot] of byUser.entries()) {
      const r = summarise(slot.points, opts.binCount);
      out.push({
        userId,
        userName:         slot.name,
        total:            r.total,
        brier:            r.brier,
        calibrationIndex: r.calibrationIndex,
      });
    }
    out.sort((a, b) => b.calibrationIndex - a.calibrationIndex);
    return out;
  }
}

export { CALIBRATION_SCHEMA_VERSION };
