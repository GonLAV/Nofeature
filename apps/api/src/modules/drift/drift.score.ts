/**
 * Pure helpers for Drift Watch.
 *
 * Each individual change between two states of a field is reduced to a
 * scalar magnitude in [0, 1]:
 *   - title        → normalised Levenshtein-ish ratio (chars-changed / max-len)
 *   - description  → same
 *   - severity     → discrete distance / 3 (P1..P4)
 *   - affected_systems → 1 - jaccard(prev, next)
 *
 * The aggregate drift score for an incident is the cumulative magnitude
 * weighted by recency (more recent changes carry more weight).
 */

export const DRIFT_SCHEMA_VERSION = 1;

export type DriftField =
  | 'title'
  | 'description'
  | 'severity'
  | 'affected_systems';

export interface DriftEvent {
  field:     DriftField;
  magnitude: number;     // 0..1
  createdAt: Date;
}

const SEVERITY_RANK: Record<string, number> = { P1: 0, P2: 1, P3: 2, P4: 3 };

const clamp01 = (n: number): number => {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
};

const round = (n: number, dp = 4): number => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

/**
 * Tiny Levenshtein distance (sufficient for our 4KB-ish description fields).
 * O(m * n) memory; we cap inputs to 4000 chars upstream.
 */
const levenshtein = (a: string, b: string): number => {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const m = a.length;
  const n = b.length;
  let prev = new Array(n + 1);
  let cur  = new Array(n + 1);
  for (let j = 0; j <= n; j += 1) prev[j] = j;
  for (let i = 1; i <= m; i += 1) {
    cur[0] = i;
    for (let j = 1; j <= n; j += 1) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      cur[j] = Math.min(
        cur[j - 1] + 1,
        prev[j] + 1,
        prev[j - 1] + cost,
      );
    }
    [prev, cur] = [cur, prev];
  }
  return prev[n];
};

export const textDriftMagnitude = (a: string, b: string): number => {
  const A = (a ?? '').trim();
  const B = (b ?? '').trim();
  if (A === B) return 0;
  const maxLen = Math.max(A.length, B.length);
  if (maxLen === 0) return 0;
  return clamp01(levenshtein(A, B) / maxLen);
};

export const severityDriftMagnitude = (a: string, b: string): number => {
  if (a === b) return 0;
  const ra = SEVERITY_RANK[a];
  const rb = SEVERITY_RANK[b];
  if (ra === undefined || rb === undefined) return 1;
  return clamp01(Math.abs(ra - rb) / 3);
};

export const tagsDriftMagnitude = (a: readonly string[], b: readonly string[]): number => {
  const A = new Set((a ?? []).map((s) => s.trim().toLowerCase()).filter(Boolean));
  const B = new Set((b ?? []).map((s) => s.trim().toLowerCase()).filter(Boolean));
  if (A.size === 0 && B.size === 0) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter += 1;
  const union = A.size + B.size - inter;
  if (union === 0) return 0;
  return clamp01(1 - inter / union);
};

export interface DriftSummary {
  schemaVersion: number;
  totalEvents:   number;
  byField:       Record<DriftField, number>;
  rawTotal:      number;
  /** Recency-weighted total in [0, +∞). Larger = more recent churn. */
  weightedScore: number;
  /** Bounded score in [0, 1] = weightedScore / (1 + weightedScore). */
  driftIndex:    number;
  startedAt:     Date | null;
  endedAt:       Date | null;
}

/**
 * Sum drift magnitudes; weight more recent events heavier with an
 * exponential kernel ( half-life = `halfLifeMinutes` ).
 */
export const summariseDrift = (
  events: readonly DriftEvent[],
  opts: { now?: Date; halfLifeMinutes?: number } = {},
): DriftSummary => {
  const now = opts.now ?? new Date();
  const halfLife = opts.halfLifeMinutes ?? 60;

  const byField: Record<DriftField, number> = {
    title: 0, description: 0, severity: 0, affected_systems: 0,
  };

  if (events.length === 0) {
    return {
      schemaVersion: DRIFT_SCHEMA_VERSION,
      totalEvents:   0,
      byField,
      rawTotal:      0,
      weightedScore: 0,
      driftIndex:    0,
      startedAt:     null,
      endedAt:       null,
    };
  }

  let raw = 0;
  let weighted = 0;
  let startedAt = events[0].createdAt;
  let endedAt   = events[0].createdAt;

  for (const e of events) {
    const m = clamp01(e.magnitude);
    raw += m;
    byField[e.field] = (byField[e.field] ?? 0) + m;

    const ageMin = Math.max(0, (now.getTime() - e.createdAt.getTime()) / 60_000);
    const decay  = Math.pow(0.5, ageMin / halfLife);
    weighted += m * decay;

    if (e.createdAt < startedAt) startedAt = e.createdAt;
    if (e.createdAt > endedAt)   endedAt   = e.createdAt;
  }

  return {
    schemaVersion: DRIFT_SCHEMA_VERSION,
    totalEvents:   events.length,
    byField:       {
      title:           round(byField.title),
      description:     round(byField.description),
      severity:        round(byField.severity),
      affected_systems: round(byField.affected_systems),
    },
    rawTotal:      round(raw),
    weightedScore: round(weighted),
    driftIndex:    round(weighted / (1 + weighted)),
    startedAt,
    endedAt,
  };
};
