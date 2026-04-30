/**
 * Resolution Convergence Index \u2014 pure scoring functions.
 *
 * Activity \u2260 progress. Five engineers typing fast can mean either
 * "converging on root cause" or "thrashing on three contradictory
 * theories". This module separates the two by combining four
 * orthogonal signals, each defensible at 3am:
 *
 *   1. executionRatio   \u2014 share of recent events that are *actions*
 *                         (status_changed, commander_assigned,
 *                         severity_changed, mitigation_*) rather than
 *                         pure discussion (comment, hypothesis_added).
 *
 *   2. scopeNarrowing   \u2014 1 - (distinct_systems_recent / distinct_systems_total).
 *                         Convergence means we are talking about
 *                         FEWER systems over time, not more.
 *
 *   3. decisionStability\u2014 1 - clamp(reversals / 5, 0, 1).
 *                         Penalises status flip-flops (resolved\u2192reopened,
 *                         severity bounce).
 *
 *   4. cadenceHealth    \u2014 reward steady cadence; punish silence and
 *                         comment storms equally. Optimum is a few
 *                         events per minute.
 */

export const CONVERGENCE_SCHEMA_VERSION = 1;
export const STUCK_THRESHOLD            = 0.40;
export const STUCK_DURATION_MIN         = 15;
export const RESOLUTION_TARGET          = 0.85;

export type Diagnosis = 'converging' | 'holding' | 'stuck' | 'diverging';

const ACTION_TYPES     = new Set(['status_changed', 'commander_assigned', 'severity_changed', 'mitigation_applied', 'mitigation_attempted']);
const DISCUSSION_TYPES = new Set(['comment', 'hypothesis_added', 'note_added']);

export interface ConvergenceInput {
  /** Recent timeline events: action labels, ordered ascending by time. */
  recentEvents:               { action: string; at: Date }[];
  /** Comment count in the recent window (treated as discussion). */
  recentComments:             number;
  /** Distinct systems mentioned anywhere on the incident. */
  distinctSystemsTotal:       number;
  /** Distinct systems mentioned in the recent window. */
  distinctSystemsRecent:      number;
  /** Number of status reversals (e.g. resolved\u2192investigating) in the incident's history. */
  statusReversals:            number;
  /** Incident age in minutes. */
  ageMinutes:                 number;
  /** Window size used to compute "recent" (minutes). */
  recentWindowMinutes:        number;
  /** Prior score \u2014 used to compute velocity if available. */
  priorScore?:                number;
  /** Time elapsed since prior score in minutes. */
  priorAgeMinutes?:           number;
  /** Current consecutive stuck minutes (state we maintain across snapshots). */
  priorStuckMinutes?:         number;
}

export interface ConvergenceOutput {
  score:                 number;
  diagnosis:             Diagnosis;
  velocityPerMin:        number;
  minutesToResolution:   number | null;
  stuckMinutes:          number;
  components: {
    executionRatio:    number;
    scopeNarrowing:    number;
    decisionStability: number;
    cadenceHealth:     number;
  };
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

export function computeComponents(input: ConvergenceInput): ConvergenceOutput['components'] {
  const actionEvents = input.recentEvents.filter((e) => ACTION_TYPES.has(e.action)).length;
  const discussionEvents =
    input.recentEvents.filter((e) => DISCUSSION_TYPES.has(e.action)).length +
    input.recentComments;
  const totalRecent = actionEvents + discussionEvents;

  // Execution ratio: 0.5 baseline when no events yet (neutral, not punitive).
  const executionRatio =
    totalRecent === 0 ? 0.5 : actionEvents / totalRecent;

  // Scope narrowing: only meaningful once we have something to narrow from.
  const scopeNarrowing =
    input.distinctSystemsTotal === 0
      ? 0.5
      : clamp01(1 - input.distinctSystemsRecent / Math.max(1, input.distinctSystemsTotal));

  // Decision stability: each reversal costs 20%, capped at zero.
  const decisionStability = clamp01(1 - input.statusReversals / 5);

  // Cadence health: reward 0.5\u20133 events/min; punish below 0.05 or above 6.
  const eventsPerMin =
    input.recentWindowMinutes > 0 ? totalRecent / input.recentWindowMinutes : 0;
  let cadenceHealth: number;
  if (eventsPerMin <= 0.05)      cadenceHealth = 0.2;
  else if (eventsPerMin >= 6)    cadenceHealth = 0.3;
  else if (eventsPerMin < 0.5)   cadenceHealth = 0.4 + (eventsPerMin - 0.05) * 1.33;  // \u2192 1
  else if (eventsPerMin <= 3)    cadenceHealth = 1;
  else                           cadenceHealth = 1 - (eventsPerMin - 3) * 0.23;

  cadenceHealth = clamp01(cadenceHealth);

  return { executionRatio, scopeNarrowing, decisionStability, cadenceHealth };
}

export function score(input: ConvergenceInput): ConvergenceOutput {
  const c = computeComponents(input);

  // Weighted blend. Execution dominates; cadence is a tiebreaker.
  const raw =
    c.executionRatio    * 0.40 +
    c.scopeNarrowing    * 0.25 +
    c.decisionStability * 0.20 +
    c.cadenceHealth     * 0.15;

  const score = clamp01(raw);

  // Velocity \u2014 if we have a prior, it's d(score)/d(min). Capped to a sane range.
  let velocityPerMin = 0;
  if (input.priorScore !== undefined && input.priorAgeMinutes && input.priorAgeMinutes > 0) {
    const v = (score - input.priorScore) / input.priorAgeMinutes;
    velocityPerMin = Math.max(-0.5, Math.min(0.5, v));
  }

  // Stuck minutes \u2014 monotonically grows while score is below STUCK_THRESHOLD,
  // resets to 0 the moment we recover.
  const priorStuck = input.priorStuckMinutes ?? 0;
  const elapsed    = input.priorAgeMinutes ?? 0;
  const stuckMinutes =
    score < STUCK_THRESHOLD ? Math.round(priorStuck + elapsed) : 0;

  // Diagnosis label.
  let diagnosis: Diagnosis;
  if (score >= 0.7 && velocityPerMin >= 0)             diagnosis = 'converging';
  else if (score < STUCK_THRESHOLD && stuckMinutes >= STUCK_DURATION_MIN) diagnosis = 'stuck';
  else if (velocityPerMin < -0.005)                     diagnosis = 'diverging';
  else                                                  diagnosis = 'holding';

  // Forward ETA \u2014 only meaningful when actually converging.
  let minutesToResolution: number | null = null;
  if (diagnosis === 'converging' && velocityPerMin > 0.001) {
    const gap = RESOLUTION_TARGET - score;
    if (gap <= 0)              minutesToResolution = 0;
    else {
      const eta = gap / velocityPerMin;
      if (eta > 0 && eta <= 240) minutesToResolution = Math.round(eta);
    }
  }

  return {
    score,
    diagnosis,
    velocityPerMin,
    minutesToResolution,
    stuckMinutes,
    components: c,
  };
}
