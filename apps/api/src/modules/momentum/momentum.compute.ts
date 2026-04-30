/**
 * Incident Momentum Index — pure scoring math.
 *
 * Synthesizes a 0-100 "are we winning?" score from raw signal
 * counts gathered out of the database. Kept DB-free so the
 * formula is fully unit-testable and deterministic.
 *
 * Sub-signals (each 0-100, weighted):
 *  • activity     — events/comments/status updates per minute
 *  • diversity    — distinct contributors in the recent window
 *  • convergence  — action items created/completed + status progress
 *  • freshness    — recency of the last meaningful event (decay)
 *
 * Severity P1/P2 raises the activity bar: an open P1 with one
 * event every 10 minutes is *not* moving; for P4 the same cadence
 * is acceptable.
 */

export type MomentumCategory = 'charging' | 'steady' | 'stalling' | 'frozen' | 'resolved';

export interface MomentumInputs {
  /** P1..P4 — drives the activity expectations. */
  severity: string;
  status: string;
  createdAt: Date;
  resolvedAt: Date | null;
  /** Events in the last 5 minutes (timeline + comments + status updates). */
  events5m: number;
  /** Events in the last 15 minutes. */
  events15m: number;
  /** Distinct user IDs that produced an event in the last 15 minutes. */
  distinctContributors15m: number;
  /** Action items created since incident start. */
  actionItemsCreated: number;
  /** Action items completed since incident start. */
  actionItemsCompleted: number;
  /** True once status has moved past 'open' (investigating/resolved/closed). */
  hasProgressedFromOpen: boolean;
  /** Most recent event timestamp (timeline/comment/status). null = nothing yet. */
  lastEventAt: Date | null;
  /** Now — injected for determinism. */
  now: Date;
}

export interface MomentumSignals {
  activity: number;     // 0-100
  diversity: number;    // 0-100
  convergence: number;  // 0-100
  freshness: number;    // 0-100
  /** Minutes since the most recent event (or since createdAt if none). */
  minutes_since_last_event: number;
  /** Expected events-per-minute used to normalize activity for this severity. */
  activity_target_epm: number;
}

export interface MomentumResult {
  score: number;            // 0-100 integer
  category: MomentumCategory;
  signals: MomentumSignals;
  /** Human-readable reason summary, e.g. "no activity for 18 minutes". */
  reason: string;
  /** True if the room appears stalled (caller decides whether to alert). */
  is_stalled: boolean;
}

/** Per-severity expected events-per-minute to call the room "moving". */
const SEVERITY_TARGET_EPM: Record<string, number> = {
  P1: 2.0,
  P2: 1.0,
  P3: 0.4,
  P4: 0.2,
};

/** Sub-signal weights — must sum to 1. */
const W = { activity: 0.40, diversity: 0.20, convergence: 0.20, freshness: 0.20 };

export function computeMomentum(i: MomentumInputs): MomentumResult {
  // Resolved/closed incidents are pinned at a neutral "resolved" state.
  if (i.status === 'resolved' || i.status === 'closed' || i.resolvedAt !== null) {
    return {
      score: 100,
      category: 'resolved',
      signals: zeroSignals(SEVERITY_TARGET_EPM[i.severity] ?? 0.5, 0),
      reason: 'incident is resolved',
      is_stalled: false,
    };
  }

  const targetEpm = SEVERITY_TARGET_EPM[i.severity] ?? 0.5;

  // 1. Activity — recent throughput vs severity target.
  // Blend 5-min and 15-min windows so a single quiet minute doesn't crash the score.
  const epm5 = i.events5m / 5;
  const epm15 = i.events15m / 15;
  const epmBlended = 0.6 * epm5 + 0.4 * epm15;
  const activity = clamp01(epmBlended / targetEpm) * 100;

  // 2. Diversity — more contributors = healthier room. Cap at 4.
  const diversity = clamp01(i.distinctContributors15m / 4) * 100;

  // 3. Convergence — action items + status progress. We give 50 pts for
  //    "any action items exist" and 50 pts scaled to completion ratio,
  //    plus a flat boost when status has moved off 'open'.
  const aiCreated = Math.min(i.actionItemsCreated, 5);
  const aiCompletedRatio =
    i.actionItemsCreated > 0 ? i.actionItemsCompleted / i.actionItemsCreated : 0;
  const convergence = Math.min(
    100,
    (aiCreated / 5) * 40 +
      aiCompletedRatio * 40 +
      (i.hasProgressedFromOpen ? 20 : 0),
  );

  // 4. Freshness — exponential decay over the last 30 min, with severity multiplier.
  //    P1 decays twice as fast as P3.
  const lastTs = i.lastEventAt ?? i.createdAt;
  const minSinceLast = Math.max(0, (i.now.getTime() - lastTs.getTime()) / 60000);
  const decayHalfLife = halfLifeMin(i.severity);
  const freshness = Math.pow(0.5, minSinceLast / decayHalfLife) * 100;

  // Composite score.
  const raw =
    W.activity * activity +
    W.diversity * diversity +
    W.convergence * convergence +
    W.freshness * freshness;
  const score = Math.round(clamp01(raw / 100) * 100);

  const category = bucket(score);
  const isStalled = (category === 'stalling' || category === 'frozen') && minSinceLast >= 5;

  return {
    score,
    category,
    signals: {
      activity: round1(activity),
      diversity: round1(diversity),
      convergence: round1(convergence),
      freshness: round1(freshness),
      minutes_since_last_event: round1(minSinceLast),
      activity_target_epm: targetEpm,
    },
    reason: explain({ category, minSinceLast, activity, diversity, convergence }),
    is_stalled: isStalled,
  };
}

function bucket(score: number): MomentumCategory {
  if (score >= 75) return 'charging';
  if (score >= 50) return 'steady';
  if (score >= 25) return 'stalling';
  return 'frozen';
}

function halfLifeMin(severity: string): number {
  switch (severity) {
    case 'P1': return 5;
    case 'P2': return 8;
    case 'P3': return 15;
    case 'P4': return 25;
    default: return 12;
  }
}

function explain(p: {
  category: MomentumCategory;
  minSinceLast: number;
  activity: number;
  diversity: number;
  convergence: number;
}): string {
  if (p.category === 'frozen') {
    return `no activity for ${Math.round(p.minSinceLast)} minutes — consider paging IC or escalating`;
  }
  if (p.category === 'stalling') {
    if (p.diversity < 25) return 'only one responder is active — pull in another teammate';
    if (p.convergence < 20) return 'no action items or status progress — capture next steps in the timeline';
    return `slow cadence — last event was ${Math.round(p.minSinceLast)} minutes ago`;
  }
  if (p.category === 'steady') return 'making steady progress';
  return 'high momentum — room is actively diagnosing';
}

function clamp01(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function round1(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 10) / 10;
}

function zeroSignals(target: number, minSince: number): MomentumSignals {
  return {
    activity: 0, diversity: 0, convergence: 0, freshness: 0,
    minutes_since_last_event: minSince,
    activity_target_epm: target,
  };
}
