/**
 * Resolution DNA — service layer.
 *
 * Given the live incident, finds the K most similar resolved incidents
 * within the same tenant, mines their timelines, and produces a
 * consensus playbook with per-step confidence and median timing.
 *
 * Pure(-ish): only depends on the pg pool injected at construction time
 * for testability.
 */

import db from '../../config/database';
import { logger } from '../../utils/logger';
import {
  tokenize, buildIdf, tfidfVector, cosine, applyBoosts,
} from './tokenize';

const DEFAULT_K = 5;
const CORPUS_LIMIT = 500;     // hard cap on resolved incidents we score against per query
const MIN_SCORE   = 0.20;     // discard noise below this final score

export interface SimilarIncident {
  id: string;
  incident_number: number | null;
  title: string;
  severity: string;
  status: string;
  resolved_at: string | null;
  ttr_minutes: number | null;
  score: number;          // final, post-boost, [0,1]
  cosine: number;         // raw cosine, for debugging / explainability
}

export interface PlaybookStep {
  step_key: string;             // normalized verb, e.g. "ack", "assign_commander", "runbook:db-failover"
  label: string;                // human label
  occurrences: number;          // number of similar incidents that performed this step
  total_matches: number;        // K (denominator)
  median_offset_min: number;    // median minutes after incident creation
  evidence: string[];           // incident_ids that demonstrated this step
  feedback_score: number;       // sum of historical thumbs (signal=+1/-1) for this step in this tenant
}

export interface DnaPayload {
  incident_id: string;
  fingerprint_tokens: string[];
  similar: SimilarIncident[];
  playbook: PlaybookStep[];
  expected_ttr_minutes: number | null;
  confidence: number;            // [0,1] — function of sample size + score quality
  generated_at: string;
}

/* ────────────────────────────────────────────────────────── */
/* Action key normalization                                  */
/* ────────────────────────────────────────────────────────── */

const STEP_LABELS: Record<string, string> = {
  ack: 'Acknowledge incident',
  assign_commander: 'Assign incident commander',
  status_investigating: 'Move to investigating',
  status_resolved: 'Mark as resolved',
  status_closed: 'Close incident',
  comment: 'Capture investigation note',
  link_added: 'Link related context',
  runbook: 'Execute runbook',
  status_update: 'Publish public status update',
  page: 'Page on-call',
};

/**
 * Map raw timeline.action values to a normalized step_key.
 * Returns null for actions we don't want to surface (noise).
 */
function normalizeAction(action: string, metadata: Record<string, unknown> | null): string | null {
  const a = (action || '').toLowerCase();
  if (a === 'incident_acknowledged' || a === 'acknowledged' || a === 'ack') return 'ack';
  if (a === 'commander_assigned' || a === 'assigned_commander') return 'assign_commander';
  if (a.startsWith('status_changed')) {
    const to = String(metadata?.to ?? metadata?.new_status ?? '').toLowerCase();
    if (to === 'investigating') return 'status_investigating';
    if (to === 'resolved') return 'status_resolved';
    if (to === 'closed') return 'status_closed';
    return null;
  }
  if (a === 'comment_added') return 'comment';
  if (a === 'link_added' || a === 'incident_link_added') return 'link_added';
  if (a === 'runbook_executed' || a === 'runbook_run') {
    const slug = String(metadata?.runbook_slug ?? metadata?.slug ?? '').toLowerCase();
    return slug ? `runbook:${slug}` : 'runbook';
  }
  if (a === 'status_update_posted' || a === 'public_update_posted') return 'status_update';
  if (a === 'paged' || a === 'oncall_paged') return 'page';
  return null;
}

function labelFor(stepKey: string): string {
  if (stepKey.startsWith('runbook:')) return `Run runbook: ${stepKey.slice(8)}`;
  return STEP_LABELS[stepKey] ?? stepKey;
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

/**
 * Load resolved candidates. `incident_number` is added by a later migration,
 * so we attempt the column-aware query first and fall back if it's missing.
 */
async function loadCandidates(tenantId: string, incidentId: string) {
  const baseSql = (cols: string) => `
    SELECT id, ${cols} title, description, severity, status, affected_systems,
           created_at, resolved_at
      FROM incidents
     WHERE tenant_id = $1
       AND id <> $2
       AND status IN ('resolved','closed')
       AND deleted_at IS NULL
     ORDER BY COALESCE(resolved_at, created_at) DESC
     LIMIT ${CORPUS_LIMIT}`;
  try {
    return await db.query(baseSql('incident_number,'), [tenantId, incidentId]);
  } catch (e) {
    logger.warn('dna.incident_number_unavailable', { error: (e as Error).message });
    return await db.query(baseSql(''), [tenantId, incidentId]);
  }
}

/* ────────────────────────────────────────────────────────── */
/* Public API                                                */
/* ────────────────────────────────────────────────────────── */

export async function computeDna(
  tenantId: string,
  incidentId: string,
  k: number = DEFAULT_K,
): Promise<DnaPayload> {
  // 1. Load the live incident.
  const live = await db.query(
    `SELECT id, title, description, severity, affected_systems, created_at
       FROM incidents
      WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
    [incidentId, tenantId],
  );
  if (live.rows.length === 0) {
    const err: Error & { status?: number } = new Error('incident not found');
    err.status = 404;
    throw err;
  }
  const target = live.rows[0];

  // 2. Load resolved candidates (cap to 500 most recent).
  // `incident_number` is added by a later migration; coalesce-friendly via a try/catch fallback.
  const candidates = await loadCandidates(tenantId, incidentId);

  if (candidates.rows.length === 0) {
    return {
      incident_id: incidentId,
      fingerprint_tokens: tokenize(`${target.title} ${target.description}`).slice(0, 30),
      similar: [],
      playbook: [],
      expected_ttr_minutes: null,
      confidence: 0,
      generated_at: new Date().toISOString(),
    };
  }

  // 3. Tokenize everything; build IDF over the tenant corpus + the target.
  const targetText = `${target.title} ${target.description} ${(target.affected_systems || []).join(' ')}`;
  const targetTokens = tokenize(targetText);

  const docTokens: string[][] = candidates.rows.map((r) =>
    tokenize(`${r.title} ${r.description} ${(r.affected_systems || []).join(' ')}`),
  );
  const idf = buildIdf([targetTokens, ...docTokens]);
  const targetVec = tfidfVector(targetTokens, idf);

  // 4. Score every candidate.
  const targetSystems = new Set<string>((target.affected_systems || []).map((s: string) => s.toLowerCase()));
  const now = Date.now();

  const scored: SimilarIncident[] = candidates.rows.map((r, i) => {
    const vec = tfidfVector(docTokens[i], idf);
    const cos = cosine(targetVec, vec);

    const candSystems = new Set<string>((r.affected_systems || []).map((s: string) => s.toLowerCase()));
    let overlap = false;
    for (const s of candSystems) if (targetSystems.has(s)) { overlap = true; break; }

    const resolvedAt = r.resolved_at ? new Date(r.resolved_at).getTime() : null;
    const daysAgo = resolvedAt ? Math.floor((now - resolvedAt) / 86400000) : null;

    const final = applyBoosts({
      cosineScore: cos,
      sameSeverity: r.severity === target.severity,
      systemsOverlap: overlap,
      resolvedDaysAgo: daysAgo,
    });

    const ttr =
      r.resolved_at && r.created_at
        ? Math.max(0, Math.round(
            (new Date(r.resolved_at).getTime() - new Date(r.created_at).getTime()) / 60000,
          ))
        : null;

    return {
      id: r.id,
      incident_number: r.incident_number ?? null,
      title: r.title,
      severity: r.severity,
      status: r.status,
      resolved_at: r.resolved_at ? new Date(r.resolved_at).toISOString() : null,
      ttr_minutes: ttr,
      score: final,
      cosine: cos,
    };
  });

  scored.sort((a, b) => b.score - a.score);
  const top = scored.filter((s) => s.score >= MIN_SCORE).slice(0, k);

  if (top.length === 0) {
    return {
      incident_id: incidentId,
      fingerprint_tokens: targetTokens.slice(0, 30),
      similar: [],
      playbook: [],
      expected_ttr_minutes: null,
      confidence: 0,
      generated_at: new Date().toISOString(),
    };
  }

  // 5. Mine timelines for the top-K matches.
  const topIds = top.map((t) => t.id);
  const timelines = await db.query(
    `SELECT t.incident_id, t.action, t.metadata, t.created_at,
            EXTRACT(EPOCH FROM (t.created_at - i.created_at)) / 60.0 AS offset_min
       FROM incident_timeline t
       JOIN incidents i ON i.id = t.incident_id
      WHERE t.tenant_id = $1
        AND t.incident_id = ANY($2::uuid[])
      ORDER BY t.incident_id, t.created_at ASC`,
    [tenantId, topIds],
  );

  // 6. Aggregate steps across timelines.
  const stepAcc = new Map<string, { offsets: number[]; evidence: Set<string> }>();
  for (const row of timelines.rows) {
    const key = normalizeAction(row.action, row.metadata);
    if (!key) continue;
    const offset = Number(row.offset_min);
    if (!Number.isFinite(offset) || offset < 0) continue;
    let entry = stepAcc.get(key);
    if (!entry) { entry = { offsets: [], evidence: new Set<string>() }; stepAcc.set(key, entry); }
    // Only count first occurrence per (incident, step) to avoid noise.
    if (!entry.evidence.has(row.incident_id)) {
      entry.offsets.push(offset);
      entry.evidence.add(row.incident_id);
    }
  }

  // 7. Pull tenant-wide feedback scores for all candidate step_keys.
  const stepKeys = Array.from(stepAcc.keys());
  let feedbackByKey = new Map<string, number>();
  if (stepKeys.length > 0) {
    try {
      const fb = await db.query(
        `SELECT step_key, COALESCE(SUM(signal), 0) AS net
           FROM incident_dna_feedback
          WHERE tenant_id = $1 AND step_key = ANY($2::text[])
          GROUP BY step_key`,
        [tenantId, stepKeys],
      );
      feedbackByKey = new Map(fb.rows.map((r: { step_key: string; net: string }) => [r.step_key, Number(r.net)]));
    } catch (e) {
      // Table may not exist yet (migration 015 not applied). Degrade gracefully.
      logger.warn('dna.feedback.unavailable', { error: (e as Error).message });
    }
  }

  // 8. Build playbook, ranked by occurrence × feedback.
  const playbook: PlaybookStep[] = Array.from(stepAcc.entries())
    .map(([key, entry]) => ({
      step_key: key,
      label: labelFor(key),
      occurrences: entry.evidence.size,
      total_matches: top.length,
      median_offset_min: median(entry.offsets),
      evidence: Array.from(entry.evidence),
      feedback_score: feedbackByKey.get(key) ?? 0,
    }))
    .filter((s) => s.occurrences >= Math.max(2, Math.ceil(top.length * 0.4))) // appear in ≥40% (and ≥2)
    .sort((a, b) => {
      // Primary: occurrence ratio. Secondary: feedback. Tertiary: earlier median = higher.
      const ratioDiff = (b.occurrences / b.total_matches) - (a.occurrences / a.total_matches);
      if (Math.abs(ratioDiff) > 0.001) return ratioDiff;
      if (b.feedback_score !== a.feedback_score) return b.feedback_score - a.feedback_score;
      return a.median_offset_min - b.median_offset_min;
    });

  // 9. Expected TTR + confidence.
  const ttrs = top.map((t) => t.ttr_minutes).filter((x): x is number => typeof x === 'number');
  const expectedTtr = ttrs.length ? median(ttrs) : null;

  const avgScore = top.reduce((acc, t) => acc + t.score, 0) / top.length;
  const sampleFactor = Math.min(1, top.length / DEFAULT_K);
  const confidence = Math.round(Math.max(0, Math.min(1, avgScore * sampleFactor)) * 100) / 100;

  return {
    incident_id: incidentId,
    fingerprint_tokens: targetTokens.slice(0, 30),
    similar: top,
    playbook,
    expected_ttr_minutes: expectedTtr,
    confidence,
    generated_at: new Date().toISOString(),
  };
}

/** Persist a per-step thumbs-up/down. Idempotent per (incident, user, step). */
export async function recordFeedback(
  tenantId: string,
  incidentId: string,
  userId: string,
  stepKey: string,
  signal: 1 | -1,
): Promise<void> {
  await db.query(
    `INSERT INTO incident_dna_feedback (tenant_id, incident_id, user_id, step_key, signal)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (incident_id, user_id, step_key)
       DO UPDATE SET signal = EXCLUDED.signal, created_at = NOW()`,
    [tenantId, incidentId, userId, stepKey, signal],
  );
}
