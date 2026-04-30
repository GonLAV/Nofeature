/**
 * Decision Ledger — DB service.
 */

import db from '../../config/database';
import { scoreResponder, ResponderScore, DecisionStatus } from './decision.score';

export interface DecisionRow {
  id: string;
  incident_id: string;
  author_id: string;
  author_name: string | null;
  action: string;
  expected_outcome: string;
  expected_metric: string | null;
  expected_direction: 'decrease' | 'increase' | 'restore' | 'none' | null;
  confidence: number;
  status: DecisionStatus;
  evaluate_at: string;
  evaluated_at: string | null;
  evaluated_by: string | null;
  outcome_note: string | null;
  created_at: string;
  is_due: boolean;
}

export async function listDecisions(tenantId: string, incidentId: string, now: Date = new Date()): Promise<DecisionRow[]> {
  const { rows } = await db.query(
    `SELECT d.id, d.incident_id, d.author_id, u.name AS author_name,
            d.action, d.expected_outcome, d.expected_metric, d.expected_direction,
            d.confidence, d.status, d.evaluate_at, d.evaluated_at, d.evaluated_by,
            d.outcome_note, d.created_at
       FROM incident_decisions d
       LEFT JOIN users u ON u.id = d.author_id
      WHERE d.tenant_id = $1 AND d.incident_id = $2
      ORDER BY d.created_at ASC`,
    [tenantId, incidentId],
  );
  return (rows as Omit<DecisionRow, 'is_due'>[]).map((r) => ({
    ...r,
    is_due: r.status === 'pending' && new Date(r.evaluate_at).getTime() <= now.getTime(),
  }));
}

export interface CreateDecisionInput {
  action: string;
  expected_outcome: string;
  expected_metric?: string | null;
  expected_direction?: 'decrease' | 'increase' | 'restore' | 'none' | null;
  confidence?: number;
  evaluate_in_minutes: number;
}

export async function createDecision(
  tenantId: string, incidentId: string, authorId: string, input: CreateDecisionInput,
): Promise<{ id: string; evaluate_at: string }> {
  const inc = await db.query(
    `SELECT 1 FROM incidents WHERE id=$1 AND tenant_id=$2 AND deleted_at IS NULL`,
    [incidentId, tenantId],
  );
  if (inc.rows.length === 0) {
    const err: Error & { status?: number } = new Error('incident not found');
    err.status = 404; throw err;
  }
  const evalAt = new Date(Date.now() + input.evaluate_in_minutes * 60_000).toISOString();
  const { rows } = await db.query(
    `INSERT INTO incident_decisions
       (tenant_id, incident_id, author_id, action, expected_outcome,
        expected_metric, expected_direction, confidence, evaluate_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING id, evaluate_at`,
    [
      tenantId, incidentId, authorId,
      input.action, input.expected_outcome,
      input.expected_metric ?? null,
      input.expected_direction ?? null,
      input.confidence ?? 70,
      evalAt,
    ],
  );
  return rows[0] as { id: string; evaluate_at: string };
}

export async function evaluateDecision(
  tenantId: string, decisionId: string, evaluatorId: string,
  status: 'worked' | 'failed' | 'inconclusive' | 'reverted',
  outcomeNote: string | null,
): Promise<{ incident_id: string; author_id: string }> {
  const { rows } = await db.query(
    `UPDATE incident_decisions
        SET status = $3, outcome_note = $4,
            evaluated_at = NOW(), evaluated_by = $5
      WHERE id = $1 AND tenant_id = $2
      RETURNING incident_id, author_id`,
    [decisionId, tenantId, status, outcomeNote, evaluatorId],
  );
  if (rows.length === 0) {
    const err: Error & { status?: number } = new Error('decision not found');
    err.status = 404; throw err;
  }
  return rows[0] as { incident_id: string; author_id: string };
}

export interface LeaderboardEntry extends ResponderScore {
  user_id: string;
  name: string;
}

export async function getLeaderboard(tenantId: string, limit = 25): Promise<LeaderboardEntry[]> {
  const { rows } = await db.query(
    `SELECT d.author_id, u.name, d.status, d.confidence, d.evaluated_at
       FROM incident_decisions d
       JOIN users u ON u.id = d.author_id
      WHERE d.tenant_id = $1`,
    [tenantId],
  );
  type Raw = { author_id: string; name: string; status: DecisionStatus; confidence: number; evaluated_at: Date | null };
  const grouped = new Map<string, { name: string; decisions: { status: DecisionStatus; confidence: number; evaluated_at: Date | null }[] }>();
  for (const r of rows as Raw[]) {
    if (!grouped.has(r.author_id)) grouped.set(r.author_id, { name: r.name, decisions: [] });
    grouped.get(r.author_id)!.decisions.push({
      status: r.status, confidence: r.confidence,
      evaluated_at: r.evaluated_at ? new Date(r.evaluated_at) : null,
    });
  }
  const entries: LeaderboardEntry[] = [];
  for (const [user_id, g] of grouped.entries()) {
    const score = scoreResponder(g.decisions);
    if (score.resolved_count === 0 && score.pending_count === 0) continue;
    entries.push({ user_id, name: g.name, ...score });
  }
  return entries
    .sort((a, b) => (b.calibration - a.calibration) || (b.accuracy - a.accuracy) || (b.resolved_count - a.resolved_count))
    .slice(0, limit);
}
