import db from '../../config/database';
import { ValidationError } from '../../utils/errors';
import {
  rankDoppelgangers,
  type DoppelgangerCandidate,
  type RankedDoppelganger,
} from './similarity.score';

/**
 * How many candidate rows we pull from Postgres before blending. Postgres
 * does the heavy lexical filtering; we re-rank in memory with tags. Keep
 * this larger than the requested limit so tags can promote rows that the
 * lexical match alone wouldn't have chosen first.
 */
const CANDIDATE_FANOUT = 50;

const sanitiseQuery = (raw: string): string => {
  // Strip Postgres tsquery operators that could change the meaning of the
  // search and inject extra terms. We then re-tokenise on whitespace and
  // join with " | " (OR) so the user's words behave like a free-text query.
  const cleaned = raw.replace(/[!&|()\\:'"<>~*]/g, ' ').trim();
  const tokens = cleaned.split(/\s+/).filter((t) => t.length >= 2 && t.length <= 80);
  if (tokens.length === 0) {
    throw new ValidationError({ q: ['Query must contain searchable text'] });
  }
  return tokens.map((t) => t.toLowerCase()).join(' | ');
};

export class DoppelgangersService {
  /** Free-text similarity search across the tenant's incidents. */
  async search(opts: {
    tenantId: string;
    query: string;
    tags: string[];
    limit: number;
    excludeIncidentId?: string;
  }): Promise<RankedDoppelganger[]> {
    const tsquery = sanitiseQuery(opts.query);

    const { rows } = await db.query(
      `SELECT id, title, severity, status,
              affected_systems, created_at, resolved_at,
              ts_rank(
                to_tsvector('simple',
                  coalesce(title,'') || ' ' || coalesce(description,'')
                ),
                to_tsquery('simple', $2)
              ) AS rank
         FROM incidents
        WHERE tenant_id = $1
          AND deleted_at IS NULL
          AND ($3::uuid IS NULL OR id <> $3::uuid)
          AND to_tsvector('simple',
                coalesce(title,'') || ' ' || coalesce(description,'')
              ) @@ to_tsquery('simple', $2)
        ORDER BY rank DESC, created_at DESC
        LIMIT $4`,
      [opts.tenantId, tsquery, opts.excludeIncidentId ?? null, CANDIDATE_FANOUT],
    );

    const candidates: DoppelgangerCandidate[] = rows.map((r: any) => ({
      id:              r.id,
      title:           r.title,
      severity:        r.severity,
      status:          r.status,
      affectedSystems: r.affected_systems ?? [],
      createdAt:       r.created_at,
      resolvedAt:      r.resolved_at,
      tsRank:          Number(r.rank) || 0,
    }));

    return rankDoppelgangers({ tags: opts.tags }, candidates, { limit: opts.limit });
  }

  /** Find historical incidents similar to a specific incident in this tenant. */
  async forIncident(opts: {
    tenantId: string;
    incidentId: string;
    limit: number;
  }): Promise<RankedDoppelganger[]> {
    const { rows } = await db.query(
      `SELECT title, description, affected_systems
         FROM incidents
        WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [opts.incidentId, opts.tenantId],
    );
    if (rows.length === 0) {
      throw new ValidationError({ incidentId: ['Incident not found in this tenant'] });
    }
    const seed = rows[0];
    const queryText = `${seed.title ?? ''} ${seed.description ?? ''}`.trim();
    if (queryText.length < 2) return [];

    return this.search({
      tenantId: opts.tenantId,
      query: queryText,
      tags: seed.affected_systems ?? [],
      limit: opts.limit,
      excludeIncidentId: opts.incidentId,
    });
  }
}
