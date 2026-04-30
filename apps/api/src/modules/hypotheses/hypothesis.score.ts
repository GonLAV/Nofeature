/**
 * Hypothesis Tracker — pure scoring math.
 *
 * confidence = (up - down) + evidence_supports * 0.6
 *              - evidence_contradicts * 0.6
 *              + freshness_bonus
 *
 * freshness_bonus uses an exponential half-life on hours-since-last-activity
 * so a hypothesis loses confidence if it's just sitting there. Confirmed
 * hypotheses are pinned at +∞ (returned as a sentinel), refuted at -∞.
 */

export interface HypothesisScoringInputs {
  status: 'investigating' | 'confirmed' | 'refuted' | 'superseded';
  upVotes: number;
  downVotes: number;
  supports: number;
  contradicts: number;
  contextEvidence: number;
  /** Most recent activity timestamp (vote, evidence, or created_at). */
  lastActivityAt: Date;
  now: Date;
}

export interface HypothesisScoreResult {
  /** Numeric score; higher = more believed. ±999 sentinels for confirmed/refuted. */
  score: number;
  /** Bucket label for UI tinting. */
  label: 'leading' | 'plausible' | 'weak' | 'rejected' | 'confirmed';
  /** Hours since last vote/evidence (clamped at 0). */
  hours_idle: number;
}

const FRESHNESS_HALF_LIFE_HOURS = 6;

export function scoreHypothesis(i: HypothesisScoringInputs): HypothesisScoreResult {
  if (i.status === 'confirmed') {
    return { score: 999, label: 'confirmed', hours_idle: 0 };
  }
  if (i.status === 'refuted' || i.status === 'superseded') {
    return { score: -999, label: 'rejected', hours_idle: 0 };
  }

  const voteScore = i.upVotes - i.downVotes;
  const evidenceScore = i.supports * 0.6 - i.contradicts * 0.6 + i.contextEvidence * 0.1;

  const hoursIdle = Math.max(
    0,
    (i.now.getTime() - i.lastActivityAt.getTime()) / 3_600_000,
  );
  // Bonus is up to +1 when fresh, decaying toward 0.
  const freshnessBonus = Math.pow(0.5, hoursIdle / FRESHNESS_HALF_LIFE_HOURS);

  const score = round1(voteScore + evidenceScore + freshnessBonus);

  let label: HypothesisScoreResult['label'];
  if (score >= 3) label = 'leading';
  else if (score >= 1) label = 'plausible';
  else if (score >= -1) label = 'weak';
  else label = 'rejected';

  return { score, label, hours_idle: round1(hoursIdle) };
}

function round1(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 10) / 10;
}
