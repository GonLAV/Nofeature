/**
 * Cognitive-load scoring math.
 *
 * Pure functions \u2014 no DB, no clock, no globals \u2014 so this is the
 * file we test exhaustively and the file we trust at 3am.
 *
 * The score is intentionally NOT a probability. It's a pressure
 * gauge: 0 means "fully available, page freely", 1 means "this
 * person is at capacity, paging them right now will degrade
 * outcomes for the incidents they're already on".
 *
 * We use a soft saturating combiner (1 - exp(-sum)) rather than a
 * naive average. Reason: a responder on three P1s and a responder
 * on three P3s should score very differently, but a *linear* sum
 * also blows past 1.0 unboundedly. The exponential keeps it in
 * [0,1] while preserving "more pressure \u2192 higher score" monotonicity.
 */

export const LOAD_SCHEMA_VERSION = 1;

export interface LoadInput {
  /** P1/P2/P3/P4 weights of incidents this user is actively on. */
  activeIncidentSeverities: ('P1' | 'P2' | 'P3' | 'P4')[];

  /** Comments authored by user across all incidents in last 60 minutes. */
  commentsLastHour: number;

  /** Minutes user has been logged-in / active during current on-call window today. */
  oncallMinutesToday: number;

  /** Minutes since the last quiet gap (\u2265 10 min with no activity). */
  minutesSinceLastBreak: number;

  /** Total on-call minutes accumulated this calendar week (rolling). */
  weeklyOncallMinutes: number;
}

export interface LoadBreakdown {
  /** Per-component contribution to the raw pressure sum (pre-saturation). */
  contributions: {
    severityPressure:  number;
    commentVelocity:   number;
    oncallToday:       number;
    breakDeprivation:  number;
    weeklyFatigue:     number;
  };
  /** Convenience: severity pressure broken out by bucket. */
  severityCounts: { P1: number; P2: number; P3: number; P4: number };
  /** Headline label for UI. */
  band: 'idle' | 'normal' | 'busy' | 'saturated' | 'overloaded';
}

export interface LoadResult {
  score:     number;        // 0..1
  breakdown: LoadBreakdown;
}

/* \u2500\u2500\u2500\u2500\u2500\u2500 weights (tunable; keep modest) \u2500\u2500\u2500\u2500\u2500\u2500 */

const SEV_WEIGHT: Record<'P1' | 'P2' | 'P3' | 'P4', number> = {
  P1: 1.0,
  P2: 0.6,
  P3: 0.25,
  P4: 0.1,
};

// Soft caps. A "1 unit" contribution means "this dimension alone is
// enough to put you in 'busy' territory".
const COMMENTS_PER_UNIT          = 30;       // 30 comments/hr \u2192 1 unit
const ONCALL_MIN_PER_UNIT        = 8 * 60;   // 8 hours today \u2192 1 unit
const BREAK_THRESHOLD_MIN        = 90;       // 90 min without break starts hurting
const BREAK_PER_UNIT             = 90;       // every additional 90 min adds 1 unit
const WEEKLY_THRESHOLD_MIN       = 30 * 60;  // 30 hr/week is healthy ceiling
const WEEKLY_PER_UNIT            = 20 * 60;  // every 20 hr beyond adds 1 unit

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);
const nonNeg  = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);

export function computeLoad(input: LoadInput): LoadResult {
  const counts = { P1: 0, P2: 0, P3: 0, P4: 0 };
  let severityPressure = 0;
  for (const s of input.activeIncidentSeverities ?? []) {
    counts[s] += 1;
    severityPressure += SEV_WEIGHT[s];
  }

  const commentVelocity  = nonNeg(input.commentsLastHour)   / COMMENTS_PER_UNIT;
  const oncallToday      = nonNeg(input.oncallMinutesToday) / ONCALL_MIN_PER_UNIT;

  const breakOver = Math.max(0, nonNeg(input.minutesSinceLastBreak) - BREAK_THRESHOLD_MIN);
  const breakDeprivation = breakOver / BREAK_PER_UNIT;

  const weeklyOver = Math.max(0, nonNeg(input.weeklyOncallMinutes) - WEEKLY_THRESHOLD_MIN);
  const weeklyFatigue = weeklyOver / WEEKLY_PER_UNIT;

  const total =
    severityPressure +
    commentVelocity +
    oncallToday +
    breakDeprivation +
    weeklyFatigue;

  // Soft saturating combiner: 1 - e^(-x). At x=1 \u2192 0.63, x=2 \u2192 0.86,
  // x=3 \u2192 0.95. Naturally bounded in [0,1).
  const score = clamp01(1 - Math.exp(-total));

  const band = bandFor(score);

  return {
    score,
    breakdown: {
      contributions: {
        severityPressure,
        commentVelocity,
        oncallToday,
        breakDeprivation,
        weeklyFatigue,
      },
      severityCounts: counts,
      band,
    },
  };
}

export function bandFor(score: number): LoadBreakdown['band'] {
  if (score < 0.15) return 'idle';
  if (score < 0.40) return 'normal';
  if (score < 0.65) return 'busy';
  if (score < 0.85) return 'saturated';
  return 'overloaded';
}

/**
 * Comparator: prefers the responder with the LOWER load. Used to
 * recommend who to page next when multiple candidates are eligible.
 */
export function pickFreshestResponder<T extends { score: number }>(candidates: T[]): T | null {
  if (!candidates || candidates.length === 0) return null;
  return [...candidates].sort((a, b) => a.score - b.score)[0];
}
