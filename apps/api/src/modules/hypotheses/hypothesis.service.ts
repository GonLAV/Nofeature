/**
 * Hypothesis Tracker — DB service.
 */

import db from '../../config/database';
import { scoreHypothesis, HypothesisScoreResult } from './hypothesis.score';

export interface HypothesisRow {
  id: string;
  incident_id: string;
  author_id: string | null;
  author_name: string | null;
  title: string;
  description: string | null;
  status: 'investigating' | 'confirmed' | 'refuted' | 'superseded';
  created_at: Date;
  updated_at: Date;
  resolved_at: Date | null;
  up_votes: number;
  down_votes: number;
  supports: number;
  contradicts: number;
  context_evidence: number;
  last_activity_at: Date;
  my_vote: number | null;
  scoring: HypothesisScoreResult;
}

export async function listHypotheses(
  tenantId: string,
  incidentId: string,
  viewerId: string,
  now: Date = new Date(),
): Promise<HypothesisRow[]> {
  const sql = `
    SELECT
      h.id, h.incident_id, h.author_id, h.title, h.description, h.status,
      h.created_at, h.updated_at, h.resolved_at,
      u.name AS author_name,
      COALESCE(SUM(CASE WHEN v.vote =  1 THEN 1 ELSE 0 END), 0)::int AS up_votes,
      COALESCE(SUM(CASE WHEN v.vote = -1 THEN 1 ELSE 0 END), 0)::int AS down_votes,
      COALESCE(SUM(CASE WHEN e.stance = 'supports'    THEN 1 ELSE 0 END), 0)::int AS supports,
      COALESCE(SUM(CASE WHEN e.stance = 'contradicts' THEN 1 ELSE 0 END), 0)::int AS contradicts,
      COALESCE(SUM(CASE WHEN e.stance = 'context'     THEN 1 ELSE 0 END), 0)::int AS context_evidence,
      GREATEST(
        h.created_at,
        COALESCE(MAX(v.created_at), h.created_at),
        COALESCE(MAX(e.created_at), h.created_at)
      ) AS last_activity_at,
      MAX(CASE WHEN v.user_id = $3 THEN v.vote END)::int AS my_vote
    FROM incident_hypotheses h
    LEFT JOIN users u                ON u.id = h.author_id
    LEFT JOIN hypothesis_votes v     ON v.hypothesis_id = h.id
    LEFT JOIN hypothesis_evidence e  ON e.hypothesis_id = h.id
   WHERE h.tenant_id = $1 AND h.incident_id = $2
   GROUP BY h.id, u.name
   ORDER BY h.created_at ASC
  `;
  const { rows } = await db.query(sql, [tenantId, incidentId, viewerId]);
  return (rows as Omit<HypothesisRow, 'scoring'>[]).map((r) => ({
    ...r,
    last_activity_at: new Date(r.last_activity_at),
    scoring: scoreHypothesis({
      status: r.status,
      upVotes: r.up_votes,
      downVotes: r.down_votes,
      supports: r.supports,
      contradicts: r.contradicts,
      contextEvidence: r.context_evidence,
      lastActivityAt: new Date(r.last_activity_at),
      now,
    }),
  }));
}

export async function createHypothesis(
  tenantId: string,
  incidentId: string,
  authorId: string,
  title: string,
  description: string | null,
): Promise<{ id: string }> {
  // Ensure incident belongs to tenant.
  const inc = await db.query(
    `SELECT 1 FROM incidents WHERE id=$1 AND tenant_id=$2 AND deleted_at IS NULL`,
    [incidentId, tenantId],
  );
  if (inc.rows.length === 0) {
    const err: Error & { status?: number } = new Error('incident not found');
    err.status = 404; throw err;
  }
  const { rows } = await db.query(
    `INSERT INTO incident_hypotheses (tenant_id, incident_id, author_id, title, description)
     VALUES ($1,$2,$3,$4,$5)
     RETURNING id`,
    [tenantId, incidentId, authorId, title, description],
  );
  return rows[0] as { id: string };
}

export async function castVote(
  tenantId: string,
  hypothesisId: string,
  userId: string,
  vote: 1 | -1 | 0,
): Promise<void> {
  await assertHypothesisInTenant(tenantId, hypothesisId);
  if (vote === 0) {
    await db.query(
      `DELETE FROM hypothesis_votes WHERE hypothesis_id=$1 AND user_id=$2`,
      [hypothesisId, userId],
    );
    return;
  }
  await db.query(
    `INSERT INTO hypothesis_votes (hypothesis_id, user_id, vote)
     VALUES ($1,$2,$3)
     ON CONFLICT (hypothesis_id, user_id) DO UPDATE SET vote = EXCLUDED.vote, created_at = NOW()`,
    [hypothesisId, userId, vote],
  );
}

export async function addEvidence(
  tenantId: string,
  hypothesisId: string,
  userId: string,
  stance: 'supports' | 'contradicts' | 'context',
  reference: Record<string, unknown>,
): Promise<{ id: string }> {
  await assertHypothesisInTenant(tenantId, hypothesisId);
  const { rows } = await db.query(
    `INSERT INTO hypothesis_evidence (hypothesis_id, user_id, stance, reference)
     VALUES ($1,$2,$3,$4) RETURNING id`,
    [hypothesisId, userId, stance, JSON.stringify(reference)],
  );
  return rows[0] as { id: string };
}

export async function updateStatus(
  tenantId: string,
  hypothesisId: string,
  newStatus: 'investigating' | 'confirmed' | 'refuted' | 'superseded',
): Promise<{ incident_id: string }> {
  const { rows } = await db.query(
    `UPDATE incident_hypotheses
        SET status = $3,
            resolved_at = CASE WHEN $3 IN ('confirmed','refuted','superseded')
                               THEN NOW() ELSE NULL END
      WHERE id = $1 AND tenant_id = $2
      RETURNING incident_id`,
    [hypothesisId, tenantId, newStatus],
  );
  if (rows.length === 0) {
    const err: Error & { status?: number } = new Error('hypothesis not found');
    err.status = 404; throw err;
  }
  // Only one hypothesis per incident may be 'confirmed' at a time.
  if (newStatus === 'confirmed') {
    await db.query(
      `UPDATE incident_hypotheses
          SET status = 'superseded',
              resolved_at = COALESCE(resolved_at, NOW())
        WHERE incident_id = $1 AND tenant_id = $2 AND id <> $3 AND status = 'confirmed'`,
      [(rows[0] as { incident_id: string }).incident_id, tenantId, hypothesisId],
    );
  }
  return rows[0] as { incident_id: string };
}

async function assertHypothesisInTenant(tenantId: string, hypothesisId: string): Promise<void> {
  const { rows } = await db.query(
    `SELECT 1 FROM incident_hypotheses WHERE id=$1 AND tenant_id=$2`,
    [hypothesisId, tenantId],
  );
  if (rows.length === 0) {
    const err: Error & { status?: number } = new Error('hypothesis not found');
    err.status = 404; throw err;
  }
}
