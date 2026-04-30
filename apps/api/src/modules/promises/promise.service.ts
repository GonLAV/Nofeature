/**
 * Postmortem Promise Ledger \u2014 service layer.
 *
 * Responsibilities:
 *   - CRUD on promises (create / update / cancel / resolve as kept|broken)
 *   - Detect *recurrence* when a new incident shares a genome with a past
 *     one whose promises were broken \u2014 record a violation row.
 *   - Aggregate trust scores per tenant / per owner.
 *
 * Concurrency: status transitions are guarded by a transactional
 * SELECT \u2026 FOR UPDATE so two raters can't fight over kept-vs-broken.
 *
 * Tenancy: every read and write is scoped by tenant_id. We never trust
 * the client-supplied tenant; it always comes from the JWT.
 */

import db from '../../config/database';
import { logger } from '../../utils/logger';
import { NotFoundError, ValidationError } from '../../utils/errors';
import {
  PROMISE_SCHEMA_VERSION,
  summarise,
  trustScore,
  type LedgerSummary,
  type PromiseRecord,
} from './promise.score';

/**
 * Promises older than this no longer count toward trust score / leaderboard
 * aggregates. Bounds memory usage and keeps queries planar as the table grows.
 */
const SCORING_HORIZON_DAYS = 365;

const writeAudit = (
  tenantId: string,
  userId: string,
  action: string,
  resourceId: string,
  metadata: Record<string, unknown> = {},
): Promise<unknown> =>
  db.query(
    `INSERT INTO audit_logs (tenant_id, user_id, action, resource, resource_id, metadata)
     VALUES ($1,$2,$3,'promise',$4,$5::jsonb)`,
    [tenantId, userId, action, resourceId, JSON.stringify(metadata)],
  ).then(() => undefined);

export type PromiseStatus = 'open' | 'kept' | 'broken' | 'cancelled';

export interface PromiseRow {
  id:               string;
  tenant_id:        string;
  incident_id:      string;
  title:            string;
  detail:           string | null;
  owner_id:         string;
  due_date:         Date;
  status:           PromiseStatus;
  kept_at:          Date | null;
  broken_at:        Date | null;
  evidence_url:     string | null;
  created_by:       string;
  created_at:       Date;
  updated_at:       Date;
}

export interface ListFilter {
  status?:     PromiseStatus;
  ownerId?:    string;
  incidentId?: string;
  limit:       number;
}

export class PromiseService {
  // ---------------------------------------------------------------- create

  async create(opts: {
    tenantId:    string;
    incidentId:  string;
    title:       string;
    detail?:     string;
    ownerId:     string;
    dueDate:     Date;
    actorId:     string;
  }): Promise<PromiseRow> {
    // Verify the incident actually belongs to this tenant before
    // we accept the promise. Prevents IDOR via crafted incidentId.
    const { rowCount: incidentOk } = await db.query(
      `SELECT 1 FROM incidents WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [opts.incidentId, opts.tenantId],
    );
    if (!incidentOk) {
      throw new ValidationError({ incidentId: ['Incident not found in this tenant'] });
    }

    // Same check for the owner.
    const { rowCount: userOk } = await db.query(
      `SELECT 1 FROM users WHERE id = $1 AND tenant_id = $2`,
      [opts.ownerId, opts.tenantId],
    );
    if (!userOk) {
      throw new ValidationError({ ownerId: ['Owner not found in this tenant'] });
    }

    const { rows } = await db.query(
      `INSERT INTO postmortem_promises
         (tenant_id, incident_id, title, detail, owner_id,
          due_date, created_by, schema_version)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [
        opts.tenantId, opts.incidentId, opts.title, opts.detail ?? null,
        opts.ownerId, opts.dueDate, opts.actorId, PROMISE_SCHEMA_VERSION,
      ],
    );

    logger.info('promise.created', {
      tenantId: opts.tenantId, incidentId: opts.incidentId,
      ownerId: opts.ownerId, actorId: opts.actorId,
    });
    await writeAudit(opts.tenantId, opts.actorId, 'promise.created', rows[0].id, {
      incidentId: opts.incidentId, ownerId: opts.ownerId,
    });

    return rows[0] as PromiseRow;
  }

  // ---------------------------------------------------------------- read

  async list(tenantId: string, f: ListFilter): Promise<PromiseRow[]> {
    const conds: string[] = ['tenant_id = $1'];
    const params: unknown[] = [tenantId];
    if (f.status)     { params.push(f.status);     conds.push(`status = $${params.length}`); }
    if (f.ownerId)    { params.push(f.ownerId);    conds.push(`owner_id = $${params.length}`); }
    if (f.incidentId) { params.push(f.incidentId); conds.push(`incident_id = $${params.length}`); }
    params.push(Math.min(500, Math.max(1, f.limit)));

    const { rows } = await db.query(
      `SELECT * FROM postmortem_promises
         WHERE ${conds.join(' AND ')}
         ORDER BY due_date ASC, created_at DESC
         LIMIT $${params.length}`,
      params,
    );
    return rows as PromiseRow[];
  }

  async getById(tenantId: string, id: string): Promise<PromiseRow> {
    const { rows } = await db.query(
      `SELECT * FROM postmortem_promises WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );
    if (rows.length === 0) throw new NotFoundError('Promise not found');
    return rows[0] as PromiseRow;
  }

  // ---------------------------------------------------------------- update

  async update(opts: {
    tenantId: string;
    id:       string;
    actorId:  string;
    title?:   string;
    detail?:  string;
    ownerId?: string;
    dueDate?: Date;
  }): Promise<PromiseRow> {
    const sets: string[] = [];
    const params: unknown[] = [];
    const push = (sql: string, v: unknown) => {
      params.push(v);
      sets.push(`${sql} = $${params.length}`);
    };
    if (opts.title   !== undefined) push('title',    opts.title);
    if (opts.detail  !== undefined) push('detail',   opts.detail);
    if (opts.ownerId !== undefined) push('owner_id', opts.ownerId);
    if (opts.dueDate !== undefined) push('due_date', opts.dueDate);
    if (sets.length === 0) {
      throw new ValidationError({ body: ['No updatable fields supplied'] });
    }

    if (opts.ownerId) {
      const { rowCount } = await db.query(
        `SELECT 1 FROM users WHERE id = $1 AND tenant_id = $2`,
        [opts.ownerId, opts.tenantId],
      );
      if (!rowCount) {
        throw new ValidationError({ ownerId: ['Owner not found in this tenant'] });
      }
    }

    params.push(opts.id, opts.tenantId);
    const { rows } = await db.query(
      `UPDATE postmortem_promises
          SET ${sets.join(', ')}, updated_at = NOW()
        WHERE id = $${params.length - 1} AND tenant_id = $${params.length}
          AND status = 'open'
        RETURNING *`,
      params,
    );
    if (rows.length === 0) {
      // Distinguish "not found" from "already resolved".
      await this.getById(opts.tenantId, opts.id); // throws NotFoundError if missing
      throw new ValidationError({ status: ['Cannot edit a resolved promise'] });
    }

    logger.info('promise.updated', {
      tenantId: opts.tenantId, id: opts.id, actorId: opts.actorId,
      fields: sets.length,
    });
    await writeAudit(opts.tenantId, opts.actorId, 'promise.updated', opts.id, {
      fields: sets.length,
    });
    return rows[0] as PromiseRow;
  }

  // ---------------------------------------------------------------- transitions

  async resolve(opts: {
    tenantId:    string;
    id:          string;
    actorId:     string;
    outcome:     'kept' | 'broken' | 'cancelled';
    evidenceUrl?: string;
    reason?:     string;
  }): Promise<PromiseRow> {
    return db.transaction(async (client) => {
      const { rows } = await client.query<PromiseRow>(
        `SELECT * FROM postmortem_promises
          WHERE id = $1 AND tenant_id = $2
          FOR UPDATE`,
        [opts.id, opts.tenantId],
      );
      if (rows.length === 0) throw new NotFoundError('Promise not found');
      const cur = rows[0];
      if (cur.status !== 'open') {
        throw new ValidationError({
          status: [`Already ${cur.status}; transitions are not reversible`],
        });
      }

      const sets: string[] = ['status = $3', 'updated_at = NOW()'];
      const params: unknown[] = [opts.id, opts.tenantId, opts.outcome];
      if (opts.outcome === 'kept') {
        sets.push('kept_at = NOW()');
      } else if (opts.outcome === 'broken') {
        sets.push('broken_at = NOW()');
      }
      if (opts.evidenceUrl) {
        params.push(opts.evidenceUrl);
        sets.push(`evidence_url = $${params.length}`);
      }

      const { rows: out } = await client.query<PromiseRow>(
        `UPDATE postmortem_promises
            SET ${sets.join(', ')}
          WHERE id = $1 AND tenant_id = $2
          RETURNING *`,
        params,
      );

      logger.info('promise.resolved', {
        tenantId: opts.tenantId, id: opts.id, outcome: opts.outcome,
        actorId: opts.actorId,
      });
      await writeAudit(opts.tenantId, opts.actorId, `promise.${opts.outcome}`, opts.id, {
        reason: opts.reason ?? null,
      });
      return out[0];
    });
  }

  // ---------------------------------------------------------------- recurrence

  /**
   * Given a *new* incident, look up genetically similar past incidents
   * that had broken promises, and record those as recurrence violations.
   * Idempotent: the (promise_id, recurrence_incident_id) UNIQUE constraint
   * makes it safe to call repeatedly.
   *
   * Returns the violations created in this call.
   */
  async detectRecurrence(opts: {
    tenantId:    string;
    incidentId:  string;
    matchIncidentIds: string[];
    costMinutes?: number;
  }): Promise<Array<{ promiseId: string; recurrenceIncidentId: string }>> {
    if (opts.matchIncidentIds.length === 0) return [];

    // Find broken promises attached to any of the matched incidents.
    const { rows: brokenRows } = await db.query(
      `SELECT id FROM postmortem_promises
        WHERE tenant_id = $1
          AND status = 'broken'
          AND incident_id = ANY($2::uuid[])`,
      [opts.tenantId, opts.matchIncidentIds],
    );
    const promiseIds = (brokenRows as Array<{ id: string }>).map((r) => r.id);
    if (promiseIds.length === 0) return [];

    const cost = Math.max(0, opts.costMinutes ?? 0);
    const { rows: inserted } = await db.query(
      `INSERT INTO promise_violations
         (tenant_id, promise_id, recurrence_incident_id, cost_minutes, schema_version)
       SELECT $1, p_id, $2, $3, $4
         FROM unnest($5::uuid[]) AS p_id
       ON CONFLICT (promise_id, recurrence_incident_id) DO NOTHING
       RETURNING promise_id, recurrence_incident_id`,
      [opts.tenantId, opts.incidentId, cost, PROMISE_SCHEMA_VERSION, promiseIds],
    );

    if (inserted.length > 0) {
      logger.warn('promise.recurrence.detected', {
        tenantId: opts.tenantId, incidentId: opts.incidentId,
        broken: inserted.length, costMinutes: cost,
      });
    }
    return (inserted as Array<{ promise_id: string; recurrence_incident_id: string }>)
      .map((r) => ({ promiseId: r.promise_id, recurrenceIncidentId: r.recurrence_incident_id }));
  }

  // ---------------------------------------------------------------- analytics

  /** Tenant-wide summary: counts + trust score. */
  async tenantSummary(tenantId: string): Promise<LedgerSummary> {
    const records = await this.fetchScoringRecords(tenantId);
    return summarise(records);
  }

  /** Per-owner trust leaderboard (descending trust). */
  async ownerLeaderboard(tenantId: string): Promise<Array<{
    ownerId: string;
    ownerName: string | null;
    trust: number;
    kept: number;
    broken: number;
    open: number;
  }>> {
    const { rows } = await db.query(
      `SELECT p.owner_id,
              u.name             AS owner_name,
              p.status,
              p.kept_at,
              p.broken_at,
              p.due_date
         FROM postmortem_promises p
         LEFT JOIN users u ON u.id = p.owner_id AND u.tenant_id = p.tenant_id
        WHERE p.tenant_id = $1
          AND p.created_at >= NOW() - make_interval(days => $2::int)`,
      [tenantId, SCORING_HORIZON_DAYS],
    );

    interface Row {
      owner_id:   string;
      owner_name: string | null;
      status:     PromiseStatus;
      kept_at:    Date | null;
      broken_at:  Date | null;
      due_date:   Date;
    }

    const buckets = new Map<string, {
      ownerName: string | null;
      records:   PromiseRecord[];
      kept:      number;
      broken:    number;
      open:      number;
    }>();

    for (const r of rows as Row[]) {
      const b = buckets.get(r.owner_id) ?? {
        ownerName: r.owner_name, records: [], kept: 0, broken: 0, open: 0,
      };
      b.ownerName = b.ownerName ?? r.owner_name;
      b.records.push({
        status:     r.status,
        resolvedAt: r.kept_at ?? r.broken_at ?? null,
        dueDate:    r.due_date,
      });
      if (r.status === 'kept')   b.kept++;
      if (r.status === 'broken') b.broken++;
      if (r.status === 'open')   b.open++;
      buckets.set(r.owner_id, b);
    }

    return Array.from(buckets.entries())
      .map(([ownerId, b]) => ({
        ownerId,
        ownerName: b.ownerName,
        trust:     trustScore(b.records),
        kept:      b.kept,
        broken:    b.broken,
        open:      b.open,
      }))
      .sort((a, b) => b.trust - a.trust);
  }

  /** Recent recurrence violations (for the dashboard). */
  async recentViolations(tenantId: string, limit = 25): Promise<Array<{
    id: string;
    promiseId: string;
    promiseTitle: string;
    originalIncidentId: string;
    recurrenceIncidentId: string;
    costMinutes: number;
    detectedAt: Date;
  }>> {
    const safe = Math.min(200, Math.max(1, limit));
    const { rows } = await db.query(
      `SELECT v.id,
              v.promise_id,
              v.recurrence_incident_id,
              v.cost_minutes,
              v.detected_at,
              p.title          AS promise_title,
              p.incident_id    AS original_incident_id
         FROM promise_violations v
         JOIN postmortem_promises p ON p.id = v.promise_id
        WHERE v.tenant_id = $1
        ORDER BY v.detected_at DESC
        LIMIT $2`,
      [tenantId, safe],
    );
    return (rows as Array<{
      id: string;
      promise_id: string;
      promise_title: string;
      original_incident_id: string;
      recurrence_incident_id: string;
      cost_minutes: number;
      detected_at: Date;
    }>).map((r) => ({
      id:                   r.id,
      promiseId:            r.promise_id,
      promiseTitle:         r.promise_title,
      originalIncidentId:   r.original_incident_id,
      recurrenceIncidentId: r.recurrence_incident_id,
      costMinutes:          r.cost_minutes,
      detectedAt:           r.detected_at,
    }));
  }

  // ---------------------------------------------------------------- helpers

  private async fetchScoringRecords(tenantId: string): Promise<PromiseRecord[]> {
    const { rows } = await db.query(
      `SELECT status, kept_at, broken_at, due_date
         FROM postmortem_promises
        WHERE tenant_id = $1
          AND created_at >= NOW() - make_interval(days => $2::int)`,
      [tenantId, SCORING_HORIZON_DAYS],
    );
    return (rows as Array<{
      status: PromiseStatus;
      kept_at: Date | null;
      broken_at: Date | null;
      due_date: Date;
    }>).map((r) => ({
      status:     r.status,
      resolvedAt: r.kept_at ?? r.broken_at ?? null,
      dueDate:    r.due_date,
    }));
  }
}
