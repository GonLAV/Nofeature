import db from '../../config/database';
import { logger } from '../../utils/logger';
import { NotFoundError, ValidationError } from '../../utils/errors';
import {
  summariseInvestigation,
  type HypothesisRecord,
  type HypothesisStatus,
  type InvestigationStats,
} from './investigation.score';

const MAX_STATS_ROWS = 10_000;

export interface Hypothesis {
  id:            string;
  incidentId:    string;
  statement:     string;
  status:        HypothesisStatus;
  createdBy:     string | null;
  createdAt:     Date;
  settledAt:     Date | null;
  settledBy:     string | null;
  settledReason: string | null;
  evidence:      Evidence[];
}

export interface Evidence {
  id:        string;
  kind:      'link' | 'note' | 'metric' | 'log';
  content:   string;
  createdBy: string | null;
  createdAt: Date;
}

const writeAudit = (
  tenantId: string,
  userId: string,
  action: string,
  resourceId: string,
  metadata: Record<string, unknown> = {},
): Promise<void> =>
  db.query(
    `INSERT INTO audit_logs (tenant_id, user_id, action, resource, resource_id, metadata)
     VALUES ($1,$2,$3,'hypothesis',$4,$5::jsonb)`,
    [tenantId, userId, action, resourceId, JSON.stringify(metadata)],
  ).then(() => undefined);

const ensureIncidentInTenant = async (tenantId: string, incidentId: string): Promise<void> => {
  const r = await db.query(
    `SELECT 1 FROM incidents WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
    [incidentId, tenantId],
  );
  if (r.rowCount === 0) {
    throw new ValidationError({ incidentId: ['Incident not found in this tenant'] });
  }
};

const mapHypothesis = (r: any, evidence: Evidence[] = []): Hypothesis => ({
  id:            r.id,
  incidentId:    r.incident_id,
  statement:     r.statement,
  status:        r.status,
  createdBy:     r.created_by,
  createdAt:     r.created_at,
  settledAt:     r.settled_at,
  settledBy:     r.settled_by,
  settledReason: r.settled_reason,
  evidence,
});

const mapEvidence = (r: any): Evidence => ({
  id:        r.id,
  kind:      r.kind,
  content:   r.content,
  createdBy: r.created_by,
  createdAt: r.created_at,
});

export class HypothesesService {
  async list(tenantId: string, incidentId: string): Promise<Hypothesis[]> {
    await ensureIncidentInTenant(tenantId, incidentId);
    const { rows: hRows } = await db.query(
      `SELECT id, incident_id, statement, status,
              created_by, created_at, settled_by, settled_at, settled_reason
         FROM hypotheses
        WHERE tenant_id = $1 AND incident_id = $2
        ORDER BY created_at ASC`,
      [tenantId, incidentId],
    );
    if (hRows.length === 0) return [];
    const ids = hRows.map((r: any) => r.id);
    const { rows: eRows } = await db.query(
      `SELECT id, hypothesis_id, kind, content, created_by, created_at
         FROM hypothesis_evidence
        WHERE tenant_id = $1 AND hypothesis_id = ANY($2::uuid[])
        ORDER BY created_at ASC`,
      [tenantId, ids],
    );
    const evByH = new Map<string, Evidence[]>();
    for (const e of eRows) {
      const list = evByH.get(e.hypothesis_id) ?? [];
      list.push(mapEvidence(e));
      evByH.set(e.hypothesis_id, list);
    }
    return hRows.map((r: any) => mapHypothesis(r, evByH.get(r.id) ?? []));
  }

  async create(opts: {
    tenantId: string; actorId: string;
    incidentId: string; statement: string;
  }): Promise<Hypothesis> {
    await ensureIncidentInTenant(opts.tenantId, opts.incidentId);
    const { rows } = await db.query(
      `INSERT INTO hypotheses (tenant_id, incident_id, statement, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING id, incident_id, statement, status,
                 created_by, created_at, settled_by, settled_at, settled_reason`,
      [opts.tenantId, opts.incidentId, opts.statement, opts.actorId],
    );
    logger.info('hypothesis.created', {
      tenantId: opts.tenantId, incidentId: opts.incidentId,
      hypothesisId: rows[0].id, actorId: opts.actorId,
    });
    await writeAudit(opts.tenantId, opts.actorId, 'hypothesis.created', rows[0].id, {
      incidentId: opts.incidentId,
    });
    return mapHypothesis(rows[0], []);
  }

  /**
   * Settle a hypothesis. Uses a row-level lock + a partial unique index on
   * (incident_id) WHERE status='confirmed' to guarantee at most one
   * confirmed hypothesis per incident even under concurrent writes.
   */
  async settle(opts: {
    tenantId: string; actorId: string;
    hypothesisId: string;
    status: 'confirmed' | 'refuted';
    settledReason?: string;
  }): Promise<Hypothesis> {
    return db.transaction(async (client) => {
      const cur = await client.query(
        `SELECT id, incident_id, status FROM hypotheses
          WHERE id = $1 AND tenant_id = $2
          FOR UPDATE`,
        [opts.hypothesisId, opts.tenantId],
      );
      if (cur.rowCount === 0) throw new NotFoundError('Hypothesis not found');
      if (cur.rows[0].status !== 'open') {
        throw new ValidationError({ status: ['Hypothesis is already settled'] });
      }

      try {
        const { rows } = await client.query(
          `UPDATE hypotheses
              SET status = $3,
                  settled_by = $4,
                  settled_at = NOW(),
                  settled_reason = $5
            WHERE id = $1 AND tenant_id = $2
            RETURNING id, incident_id, statement, status,
                      created_by, created_at, settled_by, settled_at, settled_reason`,
          [
            opts.hypothesisId, opts.tenantId, opts.status,
            opts.actorId, opts.settledReason ?? null,
          ],
        );
        logger.info('hypothesis.settled', {
          tenantId: opts.tenantId, hypothesisId: opts.hypothesisId,
          status: opts.status, actorId: opts.actorId,
        });
        await client.query(
          `INSERT INTO audit_logs (tenant_id, user_id, action, resource, resource_id, metadata)
           VALUES ($1,$2,'hypothesis.settled','hypothesis',$3,$4::jsonb)`,
          [opts.tenantId, opts.actorId, opts.hypothesisId, JSON.stringify({
            status: opts.status,
          })],
        );
        return mapHypothesis(rows[0], []);
      } catch (err: any) {
        // Partial unique index violation → another confirmed hypothesis exists.
        if (err?.code === '23505') {
          throw new ValidationError({
            status: ['This incident already has a confirmed hypothesis'],
          });
        }
        throw err;
      }
    });
  }

  async addEvidence(opts: {
    tenantId: string; actorId: string;
    hypothesisId: string;
    kind: 'link' | 'note' | 'metric' | 'log';
    content: string;
  }): Promise<Evidence> {
    const owner = await db.query(
      `SELECT 1 FROM hypotheses WHERE id = $1 AND tenant_id = $2`,
      [opts.hypothesisId, opts.tenantId],
    );
    if (owner.rowCount === 0) throw new NotFoundError('Hypothesis not found');

    const { rows } = await db.query(
      `INSERT INTO hypothesis_evidence (tenant_id, hypothesis_id, kind, content, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, kind, content, created_by, created_at`,
      [opts.tenantId, opts.hypothesisId, opts.kind, opts.content, opts.actorId],
    );
    await writeAudit(opts.tenantId, opts.actorId, 'hypothesis.evidence_added', opts.hypothesisId, {
      kind: opts.kind,
    });
    return mapEvidence(rows[0]);
  }

  /**
   * Tenant-wide investigation efficiency: hit rate, mean time to falsify,
   * mean hypotheses per incident, and current count of stale open ones.
   */
  async stats(opts: { tenantId: string; windowDays: number }): Promise<InvestigationStats> {
    const { rows } = await db.query(
      `SELECT incident_id, status, created_at, settled_at
         FROM hypotheses
        WHERE tenant_id = $1
          AND created_at >= NOW() - make_interval(days => $2::int)
        LIMIT $3`,
      [opts.tenantId, opts.windowDays, MAX_STATS_ROWS],
    );
    const records: HypothesisRecord[] = rows.map((r: any) => ({
      incidentId: r.incident_id,
      status:     r.status,
      createdAt:  r.created_at,
      settledAt:  r.settled_at,
    }));
    return summariseInvestigation(records);
  }
}
