/**
 * Decision Ledger — pure scoring.
 *
 * Two outputs, both deterministic and side-effect-free:
 *   1) accuracy      : worked / (worked + failed)        (recall-ish, ignores inconclusive)
 *   2) calibration   : Brier-style penalty across all *evaluated* bets
 *      score = 1 - mean( (resolved - confidence/100)^2 )
 *      where resolved = 1 if 'worked', 0 if 'failed', 0.5 if 'inconclusive', skip 'reverted'.
 *
 * Streak: longest tail of 'worked' decisions ending at the most recent evaluated bet.
 */

export type DecisionStatus = 'pending' | 'worked' | 'failed' | 'inconclusive' | 'reverted';

export interface DecisionForScoring {
  status: DecisionStatus;
  confidence: number; // 1..100
  evaluated_at: Date | null;
}

export interface ResponderScore {
  accuracy: number;            // 0..1, NaN-free (returns 0 when no resolved bets)
  calibration: number;         // 0..1
  current_streak: number;      // consecutive 'worked' at the tail
  resolved_count: number;
  pending_count: number;
}

const RESOLVED: Record<DecisionStatus, number | null> = {
  worked:       1,
  failed:       0,
  inconclusive: 0.5,
  reverted:     null,
  pending:      null,
};

export function scoreResponder(decisions: DecisionForScoring[]): ResponderScore {
  const evaluated = decisions
    .filter((d) => RESOLVED[d.status] !== null)
    .slice()
    .sort((a, b) => (a.evaluated_at?.getTime() ?? 0) - (b.evaluated_at?.getTime() ?? 0));

  let worked = 0;
  let failed = 0;
  let brierSum = 0;
  let brierN = 0;

  for (const d of evaluated) {
    const r = RESOLVED[d.status]!;
    if (d.status === 'worked') worked++;
    if (d.status === 'failed') failed++;
    const conf = clamp01(d.confidence / 100);
    brierSum += (r - conf) ** 2;
    brierN++;
  }

  const accuracy = worked + failed === 0 ? 0 : worked / (worked + failed);
  const calibration = brierN === 0 ? 0 : clamp01(1 - brierSum / brierN);

  // Walk backwards through evaluated bets, count consecutive 'worked'.
  let streak = 0;
  for (let i = evaluated.length - 1; i >= 0; i--) {
    if (evaluated[i].status === 'worked') streak++;
    else break;
  }

  return {
    accuracy: round3(accuracy),
    calibration: round3(calibration),
    current_streak: streak,
    resolved_count: evaluated.length,
    pending_count: decisions.filter((d) => d.status === 'pending').length,
  };
}

function clamp01(x: number): number { return Math.max(0, Math.min(1, x)); }
function round3(x: number): number { return Math.round(x * 1000) / 1000; }
