/**
 * Pure analytics for the Mitigation Memory.
 *
 * Given a stream of past mitigation applications — { effective, mttrDeltaSeconds } —
 * we compute three signals:
 *
 *   - successRate: share of evaluated applications where `effective === true`.
 *                  We use Wilson lower bound at 95% to penalise small samples.
 *   - mttrLift:    mean negative seconds (improvement) across applications
 *                  with a known mttrDeltaSeconds. Returned as positive minutes
 *                  for display ("dropped 8 minutes on average").
 *   - sampleSize:  total *evaluated* applications.
 *
 * Nothing here touches the database.
 */

export const MITIGATION_SCHEMA_VERSION = 1;

export interface MitigationApplication {
  effective:         boolean | null;
  mttrDeltaSeconds:  number | null;
}

export interface MitigationStats {
  sampleSize:    number;
  successRate:   number;   // 0..1, NaN-free
  successLowerBound: number; // Wilson 95%, 0..1
  mttrLiftSeconds: number; // positive = MTTR improved, 0 if unknown/empty
  recommendation: 'strong' | 'promising' | 'mixed' | 'weak' | 'unknown';
}

const Z = 1.96; // 95% Wilson

/**
 * Wilson lower confidence bound for a binomial proportion. Returns 0 when the
 * sample is empty so we never recommend a tactic with zero evidence.
 */
const wilsonLower = (successes: number, n: number): number => {
  if (n <= 0) return 0;
  const p = successes / n;
  const z2 = Z * Z;
  const denom = 1 + z2 / n;
  const centre = p + z2 / (2 * n);
  const margin = Z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n);
  return Math.max(0, Math.min(1, (centre - margin) / denom));
};

const recommend = (lower: number, n: number): MitigationStats['recommendation'] => {
  if (n === 0)       return 'unknown';
  if (lower >= 0.7)  return 'strong';
  if (lower >= 0.5)  return 'promising';
  if (lower >= 0.3)  return 'mixed';
  return 'weak';
};

/**
 * Aggregate a list of mitigation applications into a stats summary suitable
 * for ranking and UI display.
 */
export const summariseMitigation = (
  apps: MitigationApplication[],
): MitigationStats => {
  let evaluated = 0;
  let successes = 0;
  let mttrSum   = 0;
  let mttrN     = 0;

  for (const a of apps) {
    if (a.effective !== null && a.effective !== undefined) {
      evaluated += 1;
      if (a.effective) successes += 1;
    }
    if (a.mttrDeltaSeconds !== null && a.mttrDeltaSeconds !== undefined &&
        Number.isFinite(a.mttrDeltaSeconds)) {
      mttrSum += a.mttrDeltaSeconds;
      mttrN   += 1;
    }
  }

  const successRate = evaluated === 0 ? 0 : successes / evaluated;
  const lower = wilsonLower(successes, evaluated);
  // mttr_delta_seconds is stored as negative when MTTR improves; flip the sign
  // for the user-facing "lift" metric (positive seconds saved on average).
  const lift = mttrN === 0 ? 0 : Math.max(0, -(mttrSum / mttrN));

  return {
    sampleSize:        evaluated,
    successRate,
    successLowerBound: lower,
    mttrLiftSeconds:   lift,
    recommendation:    recommend(lower, evaluated),
  };
};
