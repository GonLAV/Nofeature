import db from '../../config/database';
import { logger } from '../../utils/logger';
import { NotFoundError, ValidationError } from '../../utils/errors';
import {
  summariseMitigation,
  type MitigationApplication,
  type MitigationStats,
} from './mitigation.score';

/** Cap to keep memory bounded on hot tenants. */
const MAX_HISTORY_ROWS = 5_000;

export interface TaxonomyRow {
  id:          string;
  slug:        string;
  label:       string;
  description: string | null;
}

export interface FailureModeTag extends TaxonomyRow {
  confidence: number;
  taggedBy:   string | null;
  createdAt:  Date;
}

export interface MitigationApplicationRow extends TaxonomyRow {
  applicationId:    string;
  effective:        boolean | null;
  mttrDeltaSeconds: number | null;
  notes:            string | null;
  appliedBy:        string | null;
  createdAt:        Date;
}

export interface MemoryEntry {
  mitigation: TaxonomyRow;
  stats:      MitigationStats;
}

const writeAudit = (
  tenantId: string,
  userId: string,
  action: string,
  resource: string,
  resourceId: string,
  metadata: Record<string, unknown> = {},
): Promise<void> =>
  db.query(
    `INSERT INTO audit_logs (tenant_id, user_id, action, resource, resource_id, metadata)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,
    [tenantId, userId, action, resource, resourceId, JSON.stringify(metadata)],
  ).then(() => undefined);

const ensureIncidentInTenant = async (tenantId: string, incidentId: string): Promise<void> => {
  const r = await db.query(
    `SELECT 1 FROM incidents
      WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
    [incidentId, tenantId],
  );
  if (r.rowCount === 0) {
    throw new ValidationError({ incidentId: ['Incident not found in this tenant'] });
  }
};

export class DnaService {
  // -------- Taxonomy: failure modes --------

  async upsertFailureMode(opts: {
    tenantId: string; actorId: string;
    slug: string; label: string; description?: string;
  }): Promise<TaxonomyRow> {
    const { rows } = await db.query(
      `INSERT INTO failure_modes (tenant_id, slug, label, description)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (tenant_id, slug) DO UPDATE
         SET label = EXCLUDED.label,
             description = EXCLUDED.description
       RETURNING id, slug, label, description`,
      [opts.tenantId, opts.slug, opts.label, opts.description ?? null],
    );
    await writeAudit(opts.tenantId, opts.actorId, 'failure_mode.upsert', 'failure_mode', rows[0].id, {
      slug: opts.slug,
    });
    return rows[0];
  }

  async listFailureModes(tenantId: string): Promise<TaxonomyRow[]> {
    const { rows } = await db.query(
      `SELECT id, slug, label, description FROM failure_modes
        WHERE tenant_id = $1 ORDER BY slug`,
      [tenantId],
    );
    return rows;
  }

  // -------- Taxonomy: mitigations --------

  async upsertMitigation(opts: {
    tenantId: string; actorId: string;
    slug: string; label: string; description?: string;
  }): Promise<TaxonomyRow> {
    const { rows } = await db.query(
      `INSERT INTO mitigations (tenant_id, slug, label, description)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (tenant_id, slug) DO UPDATE
         SET label = EXCLUDED.label,
             description = EXCLUDED.description
       RETURNING id, slug, label, description`,
      [opts.tenantId, opts.slug, opts.label, opts.description ?? null],
    );
    await writeAudit(opts.tenantId, opts.actorId, 'mitigation.upsert', 'mitigation', rows[0].id, {
      slug: opts.slug,
    });
    return rows[0];
  }

  async listMitigations(tenantId: string): Promise<TaxonomyRow[]> {
    const { rows } = await db.query(
      `SELECT id, slug, label, description FROM mitigations
        WHERE tenant_id = $1 ORDER BY slug`,
      [tenantId],
    );
    return rows;
  }

  // -------- Tagging incidents --------

  async tagFailureMode(opts: {
    tenantId: string; actorId: string;
    incidentId: string; slug: string; confidence: number;
  }): Promise<FailureModeTag> {
    await ensureIncidentInTenant(opts.tenantId, opts.incidentId);
    const fm = await db.query(
      `SELECT id, slug, label, description FROM failure_modes
        WHERE tenant_id = $1 AND slug = $2`,
      [opts.tenantId, opts.slug],
    );
    if (fm.rowCount === 0) {
      throw new ValidationError({ failureModeSlug: ['Unknown failure mode'] });
    }

    const { rows } = await db.query(
      `INSERT INTO incident_failure_modes
         (tenant_id, incident_id, failure_mode_id, confidence, tagged_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (incident_id, failure_mode_id) DO UPDATE
         SET confidence = EXCLUDED.confidence,
             tagged_by  = EXCLUDED.tagged_by
       RETURNING id, confidence, tagged_by, created_at`,
      [opts.tenantId, opts.incidentId, fm.rows[0].id, opts.confidence, opts.actorId],
    );
    logger.info('failure_mode.tagged', {
      tenantId: opts.tenantId, incidentId: opts.incidentId, slug: opts.slug,
      actorId: opts.actorId,
    });
    await writeAudit(opts.tenantId, opts.actorId, 'failure_mode.tagged', 'incident', opts.incidentId, {
      slug: opts.slug, confidence: opts.confidence,
    });
    return {
      id:          fm.rows[0].id,
      slug:        fm.rows[0].slug,
      label:       fm.rows[0].label,
      description: fm.rows[0].description,
      confidence:  Number(rows[0].confidence),
      taggedBy:    rows[0].tagged_by,
      createdAt:   rows[0].created_at,
    };
  }

  async untagFailureMode(opts: {
    tenantId: string; actorId: string;
    incidentId: string; slug: string;
  }): Promise<void> {
    const r = await db.query(
      `DELETE FROM incident_failure_modes
        WHERE tenant_id = $1
          AND incident_id = $2
          AND failure_mode_id = (
            SELECT id FROM failure_modes WHERE tenant_id = $1 AND slug = $3
          )`,
      [opts.tenantId, opts.incidentId, opts.slug],
    );
    if (r.rowCount === 0) throw new NotFoundError('Tag not found');
    await writeAudit(opts.tenantId, opts.actorId, 'failure_mode.untagged', 'incident', opts.incidentId, {
      slug: opts.slug,
    });
  }

  async listIncidentFailureModes(tenantId: string, incidentId: string): Promise<FailureModeTag[]> {
    await ensureIncidentInTenant(tenantId, incidentId);
    const { rows } = await db.query(
      `SELECT fm.id, fm.slug, fm.label, fm.description,
              ifm.confidence, ifm.tagged_by, ifm.created_at
         FROM incident_failure_modes ifm
         JOIN failure_modes fm ON fm.id = ifm.failure_mode_id
        WHERE ifm.tenant_id = $1 AND ifm.incident_id = $2
        ORDER BY ifm.created_at DESC`,
      [tenantId, incidentId],
    );
    return rows.map((r: any) => ({
      id:          r.id,
      slug:        r.slug,
      label:       r.label,
      description: r.description,
      confidence:  Number(r.confidence),
      taggedBy:    r.tagged_by,
      createdAt:   r.created_at,
    }));
  }

  // -------- Mitigations applied to incidents --------

  async applyMitigation(opts: {
    tenantId: string; actorId: string;
    incidentId: string; slug: string;
    effective?: boolean;
    mttrDeltaSeconds?: number;
    notes?: string;
  }): Promise<MitigationApplicationRow> {
    await ensureIncidentInTenant(opts.tenantId, opts.incidentId);
    const mit = await db.query(
      `SELECT id, slug, label, description FROM mitigations
        WHERE tenant_id = $1 AND slug = $2`,
      [opts.tenantId, opts.slug],
    );
    if (mit.rowCount === 0) {
      throw new ValidationError({ mitigationSlug: ['Unknown mitigation'] });
    }

    const { rows } = await db.query(
      `INSERT INTO incident_mitigations
         (tenant_id, incident_id, mitigation_id, effective, mttr_delta_seconds, notes, applied_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (incident_id, mitigation_id) DO UPDATE
         SET effective          = COALESCE(EXCLUDED.effective,          incident_mitigations.effective),
             mttr_delta_seconds = COALESCE(EXCLUDED.mttr_delta_seconds, incident_mitigations.mttr_delta_seconds),
             notes              = COALESCE(EXCLUDED.notes,              incident_mitigations.notes),
             applied_by         = EXCLUDED.applied_by
       RETURNING id, effective, mttr_delta_seconds, notes, applied_by, created_at`,
      [
        opts.tenantId, opts.incidentId, mit.rows[0].id,
        opts.effective ?? null, opts.mttrDeltaSeconds ?? null,
        opts.notes ?? null, opts.actorId,
      ],
    );

    logger.info('mitigation.applied', {
      tenantId: opts.tenantId, incidentId: opts.incidentId,
      slug: opts.slug, effective: opts.effective ?? null,
      actorId: opts.actorId,
    });
    await writeAudit(opts.tenantId, opts.actorId, 'mitigation.applied', 'incident', opts.incidentId, {
      slug: opts.slug, effective: opts.effective ?? null,
      mttrDeltaSeconds: opts.mttrDeltaSeconds ?? null,
    });

    return {
      applicationId:    rows[0].id,
      id:               mit.rows[0].id,
      slug:             mit.rows[0].slug,
      label:            mit.rows[0].label,
      description:      mit.rows[0].description,
      effective:        rows[0].effective,
      mttrDeltaSeconds: rows[0].mttr_delta_seconds,
      notes:            rows[0].notes,
      appliedBy:        rows[0].applied_by,
      createdAt:        rows[0].created_at,
    };
  }

  async listIncidentMitigations(tenantId: string, incidentId: string): Promise<MitigationApplicationRow[]> {
    await ensureIncidentInTenant(tenantId, incidentId);
    const { rows } = await db.query(
      `SELECT im.id AS application_id,
              m.id, m.slug, m.label, m.description,
              im.effective, im.mttr_delta_seconds, im.notes,
              im.applied_by, im.created_at
         FROM incident_mitigations im
         JOIN mitigations m ON m.id = im.mitigation_id
        WHERE im.tenant_id = $1 AND im.incident_id = $2
        ORDER BY im.created_at DESC`,
      [tenantId, incidentId],
    );
    return rows.map((r: any) => ({
      applicationId:    r.application_id,
      id:               r.id,
      slug:             r.slug,
      label:            r.label,
      description:      r.description,
      effective:        r.effective,
      mttrDeltaSeconds: r.mttr_delta_seconds,
      notes:            r.notes,
      appliedBy:        r.applied_by,
      createdAt:        r.created_at,
    }));
  }

  // -------- Mitigation Memory --------

  /** Group raw rows by mitigation and run them through the pure scorer. */
  private rankMitigations(
    rows: Array<{
      id: string; slug: string; label: string; description: string | null;
      effective: boolean | null; mttr_delta_seconds: number | null;
    }>,
  ): MemoryEntry[] {
    const byMit = new Map<string, { meta: TaxonomyRow; apps: MitigationApplication[] }>();
    for (const r of rows) {
      const slot = byMit.get(r.id) ?? {
        meta: { id: r.id, slug: r.slug, label: r.label, description: r.description } as TaxonomyRow,
        apps: [] as MitigationApplication[],
      };
      slot.apps.push({
        effective:        r.effective,
        mttrDeltaSeconds: r.mttr_delta_seconds,
      });
      byMit.set(r.id, slot);
    }
    const out: MemoryEntry[] = [];
    for (const slot of byMit.values()) {
      out.push({ mitigation: slot.meta, stats: summariseMitigation(slot.apps) });
    }
    out.sort((a, b) =>
      b.stats.successLowerBound - a.stats.successLowerBound ||
      b.stats.sampleSize        - a.stats.sampleSize,
    );
    return out;
  }

  /**
   * For a given failure mode, summarise every mitigation that has ever been
   * applied to incidents tagged with that mode, ranked by Wilson lower bound
   * of the success rate. This is the killer query — answering
   * "if we see this pattern again, what's worked before?"
   */
  async memoryFor(opts: {
    tenantId: string;
    failureModeSlug: string;
    windowDays: number;
  }): Promise<MemoryEntry[]> {
    const fm = await db.query(
      `SELECT id FROM failure_modes WHERE tenant_id = $1 AND slug = $2`,
      [opts.tenantId, opts.failureModeSlug],
    );
    if (fm.rowCount === 0) {
      throw new NotFoundError('Failure mode not found');
    }

    const { rows } = await db.query(
      `SELECT m.id, m.slug, m.label, m.description,
              im.effective, im.mttr_delta_seconds
         FROM incident_failure_modes ifm
         JOIN incident_mitigations im
           ON im.incident_id = ifm.incident_id
          AND im.tenant_id   = ifm.tenant_id
         JOIN mitigations m ON m.id = im.mitigation_id
        WHERE ifm.tenant_id = $1
          AND ifm.failure_mode_id = $2
          AND im.created_at >= NOW() - make_interval(days => $3::int)
        LIMIT $4`,
      [opts.tenantId, fm.rows[0].id, opts.windowDays, MAX_HISTORY_ROWS],
    );

    return this.rankMitigations(rows);
  }

  /**
   * The killer endpoint: given a NEW incident with one or more failure-mode
   * tags, surface the mitigations that have historically worked best on
   * incidents sharing ANY of those tags. This is what turns past postmortems
   * into actionable advice in the middle of a live incident.
   */
  async recommendForIncident(opts: {
    tenantId: string;
    incidentId: string;
    windowDays: number;
  }): Promise<MemoryEntry[]> {
    await ensureIncidentInTenant(opts.tenantId, opts.incidentId);

    const { rows } = await db.query(
      `WITH this_modes AS (
         SELECT failure_mode_id
           FROM incident_failure_modes
          WHERE tenant_id = $1 AND incident_id = $2
       )
       SELECT m.id, m.slug, m.label, m.description,
              im.effective, im.mttr_delta_seconds
         FROM incident_failure_modes ifm
         JOIN incident_mitigations im
           ON im.tenant_id = ifm.tenant_id
          AND im.incident_id = ifm.incident_id
         JOIN mitigations m ON m.id = im.mitigation_id
        WHERE ifm.tenant_id = $1
          AND ifm.incident_id <> $2
          AND ifm.failure_mode_id IN (SELECT failure_mode_id FROM this_modes)
          AND im.created_at >= NOW() - make_interval(days => $3::int)
        LIMIT $4`,
      [opts.tenantId, opts.incidentId, opts.windowDays, MAX_HISTORY_ROWS],
    );

    return this.rankMitigations(rows).slice(0, 10);
  }
}
