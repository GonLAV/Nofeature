/**
 * Incident Genome service.
 *
 * Owns three responsibilities:
 *
 *   1. EXTRACT  \u2014 read all raw signals for an incident from the DB
 *      (a single round-trip with sub-queries) and feed them into
 *      `computeGenome`.
 *
 *   2. PERSIST  \u2014 upsert the resulting vector + breakdown into
 *      `incident_genomes`. Idempotent.
 *
 *   3. MATCH    \u2014 given an incident's genome, return the top-K
 *      most-similar past incidents in the same tenant (cosine
 *      similarity, computed in app code so we don't need pgvector).
 *      Returns the breakdown so the UI can show *why*.
 *
 * Cost
 * \u2500\u2500\u2500\u2500
 * Match scans every genome in the tenant. With a 10-dim vector and
 * a hot tenant of ~5k incidents, that's 50k floats and ~50k mults
 * \u2014 well under 5 ms. We add a guard at 50k incidents to switch to
 * a partitioned scan, but we're nowhere close.
 */

import db from '../../config/database';
import { NotFoundError } from '../../utils/errors';
import {
  computeGenome,
  cosineSimilarity,
  GENOME_DIMS,
  GENOME_SCHEMA_VERSION,
  type GenomeInput,
  type GenomeBreakdown,
} from './genome.score';

const MAX_TENANT_INCIDENTS_FOR_INMEMORY_MATCH = 50_000;

interface IncidentRow {
  id:               string;
  tenant_id:        string;
  title:            string;
  severity:         GenomeInput['severity'];
  status:           string;
  affected_systems: string[] | null;
  created_at:       Date;
  resolved_at:      Date | null;
}

interface SignalRow {
  service_count:        string;
  responder_count:      string;
  comment_count:        string;
  timeline_count:       string;
  early_count:          string;
  distinct_status_evts: string;
  tag_count:            string;
}

export interface GenomeRecord {
  incidentId:     string;
  vector:         number[];
  components:     GenomeBreakdown;
  schemaVersion:  number;
  generatedAt:    Date;
}

export interface MatchResult {
  incidentId:    string;
  title:         string;
  severity:      string;
  status:        string;
  resolvedAt:    Date | null;
  similarity:    number;             // cosine in [-1, 1], typically [0,1]
  contributions: { dim: number; contribution: number }[];
}

export class GenomeService {
  /** Compute (and persist) a fresh genome for the given incident. */
  async generate(incidentId: string, tenantId: string): Promise<GenomeRecord> {
    const inc = await this.loadIncident(incidentId, tenantId);
    const sig = await this.loadSignals(incidentId, tenantId, inc.created_at, inc.resolved_at);

    const durationMin =
      inc.resolved_at
        ? (inc.resolved_at.getTime() - inc.created_at.getTime()) / 60_000
        : (Date.now() - inc.created_at.getTime()) / 60_000;

    const timelineCount = Number(sig.timeline_count) || 0;
    const earlyCount    = Number(sig.early_count)    || 0;
    const earlyRatio    = timelineCount > 0 ? earlyCount / timelineCount : 0;

    const input: GenomeInput = {
      severity:           inc.severity,
      durationMinutes:    durationMin,
      affectedSystems:    inc.affected_systems?.length ?? 0,
      serviceCount:       Number(sig.service_count)        || 0,
      responderCount:     Number(sig.responder_count)      || 0,
      commentCount:       Number(sig.comment_count)        || 0,
      timelineEventCount: timelineCount,
      earlyActionRatio:   earlyRatio,
      statusValues:       Number(sig.distinct_status_evts) || 0,
      tagCount:           Number(sig.tag_count)            || 0,
    };

    const { vector, components } = computeGenome(input);

    const { rows } = await db.query(
      `INSERT INTO incident_genomes
         (incident_id, tenant_id, vector, components, schema_version, generated_at)
       VALUES ($1, $2, $3::real[], $4::jsonb, $5, NOW())
       ON CONFLICT (incident_id) DO UPDATE
         SET vector         = EXCLUDED.vector,
             components     = EXCLUDED.components,
             schema_version = EXCLUDED.schema_version,
             generated_at   = EXCLUDED.generated_at
       RETURNING incident_id, vector, components, schema_version, generated_at`,
      [incidentId, tenantId, vector, JSON.stringify(components), GENOME_SCHEMA_VERSION],
    );

    const r = rows[0] as { incident_id: string; vector: number[]; components: GenomeBreakdown; schema_version: number; generated_at: Date };
    return {
      incidentId:    r.incident_id,
      vector:        r.vector,
      components:    r.components,
      schemaVersion: r.schema_version,
      generatedAt:   r.generated_at,
    };
  }

  /** Load existing genome, computing one if missing or stale. */
  async getOrGenerate(incidentId: string, tenantId: string): Promise<GenomeRecord> {
    const { rows } = await db.query(
      `SELECT incident_id, vector, components, schema_version, generated_at
         FROM incident_genomes
        WHERE incident_id = $1 AND tenant_id = $2`,
      [incidentId, tenantId],
    );
    if (rows.length === 0) return this.generate(incidentId, tenantId);
    const r = rows[0] as { incident_id: string; vector: number[]; components: GenomeBreakdown; schema_version: number; generated_at: Date };
    if (r.schema_version !== GENOME_SCHEMA_VERSION) {
      // Recompute on schema upgrades \u2014 cheap and ensures the index
      // is always self-consistent for matching.
      return this.generate(incidentId, tenantId);
    }
    return {
      incidentId:    r.incident_id,
      vector:        r.vector,
      components:    r.components,
      schemaVersion: r.schema_version,
      generatedAt:   r.generated_at,
    };
  }

  /**
   * Top-K incidents most genetically similar to the given one.
   * Excludes the source incident itself. Only matches against the
   * current schema version \u2014 stale rows are ignored, not silently
   * compared (would corrupt rankings).
   */
  async findMatches(
    incidentId: string,
    tenantId: string,
    limit = 5,
  ): Promise<MatchResult[]> {
    const source = await this.getOrGenerate(incidentId, tenantId);
    if (source.vector.length !== GENOME_DIMS) {
      throw new Error(`Source genome has wrong dimensionality: ${source.vector.length}`);
    }

    // Cardinality guard: if a tenant somehow has 50k+ incidents,
    // fall back to a tighter pre-filter (same severity bucket).
    const { rows: countRows } = await db.query(
      `SELECT COUNT(*)::int AS n
         FROM incident_genomes
        WHERE tenant_id = $1 AND schema_version = $2`,
      [tenantId, GENOME_SCHEMA_VERSION],
    );
    const total = (countRows[0] as { n: number }).n;

    const { rows } = await db.query(
      total > MAX_TENANT_INCIDENTS_FOR_INMEMORY_MATCH
        ? // Severity-bucket pre-filter for hyperscale tenants.
          `SELECT g.incident_id, g.vector, i.title, i.severity, i.status, i.resolved_at
             FROM incident_genomes g
             JOIN incidents i ON i.id = g.incident_id
            WHERE g.tenant_id = $1
              AND g.schema_version = $2
              AND g.incident_id <> $3
              AND i.deleted_at IS NULL
              AND i.severity = (SELECT severity FROM incidents WHERE id = $3)`
        : `SELECT g.incident_id, g.vector, i.title, i.severity, i.status, i.resolved_at
             FROM incident_genomes g
             JOIN incidents i ON i.id = g.incident_id
            WHERE g.tenant_id = $1
              AND g.schema_version = $2
              AND g.incident_id <> $3
              AND i.deleted_at IS NULL`,
      [tenantId, GENOME_SCHEMA_VERSION, incidentId],
    );

    type Row = { incident_id: string; vector: number[]; title: string; severity: string; status: string; resolved_at: Date | null };
    const matches: MatchResult[] = (rows as Row[])
      .map((r) => {
        const sim = cosineSimilarity(source.vector, r.vector);
        return {
          incidentId:    r.incident_id,
          title:         r.title,
          severity:      r.severity,
          status:        r.status,
          resolvedAt:    r.resolved_at,
          similarity:    sim,
          contributions: this.contribsForUI(source.vector, r.vector),
        };
      })
      // Only surface meaningfully-similar results. 0.6 is empirically
      // the threshold below which "similar" stops feeling similar.
      .filter((m) => m.similarity >= 0.6)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);

    return matches;
  }

  /** Internal: load the incident header. */
  private async loadIncident(incidentId: string, tenantId: string): Promise<IncidentRow> {
    const { rows } = await db.query(
      `SELECT id, tenant_id, title, severity, status, affected_systems, created_at, resolved_at
         FROM incidents
        WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [incidentId, tenantId],
    );
    if (rows.length === 0) throw new NotFoundError('Incident not found');
    return rows[0] as IncidentRow;
  }

  /**
   * Internal: load all aggregate signals in a single round-trip.
   * Each sub-select is independent and indexed; the pg planner
   * inlines them.
   */
  private async loadSignals(
    incidentId: string,
    tenantId: string,
    createdAt:  Date,
    resolvedAt: Date | null,
  ): Promise<SignalRow> {
    // For "early action ratio" we need a cutoff at 25% of duration.
    // For unresolved incidents we use NOW() so the cutoff is "25% of
    // elapsed so far" \u2014 still meaningful for live triage.
    const endMs    = (resolvedAt ?? new Date()).getTime();
    const startMs  = createdAt.getTime();
    const earlyCut = new Date(startMs + (endMs - startMs) * 0.25);

    const { rows } = await db.query(
      `SELECT
         (SELECT COUNT(*) FROM incident_services
            WHERE incident_id = $1) AS service_count,
         (SELECT COUNT(DISTINCT user_id) FROM incident_timeline
            WHERE incident_id = $1 AND user_id IS NOT NULL) AS responder_count,
         (SELECT COUNT(*) FROM incident_comments
            WHERE incident_id = $1) AS comment_count,
         (SELECT COUNT(*) FROM incident_timeline
            WHERE incident_id = $1) AS timeline_count,
         (SELECT COUNT(*) FROM incident_timeline
            WHERE incident_id = $1 AND created_at <= $2) AS early_count,
         (SELECT COUNT(DISTINCT (metadata->>'newStatus')) FROM incident_timeline
            WHERE incident_id = $1
              AND action = 'status_changed'
              AND metadata ? 'newStatus') AS distinct_status_evts,
         (SELECT COUNT(*) FROM incident_tags
            WHERE incident_id = $1) AS tag_count`,
      [incidentId, earlyCut],
    );
    void tenantId; // Tenant scoping is enforced at the parent incident lookup.
    return rows[0] as SignalRow;
  }

  private contribsForUI(a: number[], b: number[]) {
    const magA = Math.sqrt(a.reduce((s, v) => s + v * v, 0));
    const magB = Math.sqrt(b.reduce((s, v) => s + v * v, 0));
    if (magA === 0 || magB === 0) return [];
    const denom = magA * magB;
    return a
      .map((v, i) => ({ dim: i, contribution: (v * b[i]) / denom }))
      .sort((x, y) => y.contribution - x.contribution)
      .slice(0, 3);
  }
}
