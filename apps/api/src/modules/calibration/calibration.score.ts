/**
 * Confidence-calibration math, kept pure so it is easy to test and reason about.
 *
 * A "prediction" is a statement plus a stated probability `p ∈ [0, 1]` that
 * the statement is true. Once the statement is adjudicated, we know the
 * outcome `o ∈ {0, 1}`. From a stream of `(p, o)` pairs we derive:
 *
 *   - Brier score        = mean( (p − o)^2 )                     (lower is better, 0..1)
 *   - Log loss           = mean( −(o·log p + (1−o)·log(1−p)) )   (lower is better)
 *   - Reliability bins   = bucketed mean(p) vs mean(o)
 *   - Calibration index  = 1 − weighted mean | mean(p) − mean(o) | per bin
 *                          (1 = perfectly calibrated, 0 = maximally miscalibrated)
 *   - Resolution         = variance of mean(o) across bins (Murphy decomposition)
 *
 * Nothing here touches the database.
 */

export const CALIBRATION_SCHEMA_VERSION = 1;

/** A prediction whose outcome is known. */
export interface ResolvedPrediction {
  confidence: number;   // p ∈ [0, 1]
  correct:    boolean;  // o ∈ {0, 1}
}

export interface ReliabilityBin {
  /** Inclusive lower bound of confidence bucket. */
  from:        number;
  /** Exclusive upper bound (inclusive at the very top). */
  to:          number;
  /** Mean stated confidence in the bin. */
  meanConfidence: number;
  /** Empirical accuracy in the bin. */
  accuracy:    number;
  /** Number of predictions that landed in the bin. */
  count:       number;
}

export interface CalibrationReport {
  schemaVersion:   number;
  total:           number;
  brier:           number;        // 0 if total === 0
  logLoss:         number;        // 0 if total === 0
  calibrationIndex: number;       // 1 if total === 0 (no evidence => no penalty)
  resolution:      number;        // 0 if total === 0
  bins:            ReliabilityBin[];
}

const EPSILON = 1e-12;
const DEFAULT_BIN_COUNT = 10;

const clamp01 = (n: number): number =>
  n < 0 ? 0 : n > 1 ? 1 : n;

/**
 * Build N evenly-sized bins covering [0, 1]. The last bin is closed on the
 * right so that confidence === 1 lands somewhere.
 */
const makeBinEdges = (count: number): { from: number; to: number }[] => {
  const out: { from: number; to: number }[] = [];
  for (let i = 0; i < count; i++) {
    out.push({ from: i / count, to: (i + 1) / count });
  }
  return out;
};

const findBinIndex = (p: number, count: number): number => {
  if (p >= 1) return count - 1;
  if (p <= 0) return 0;
  return Math.min(count - 1, Math.floor(p * count));
};

/**
 * Brier score: mean squared error between stated probability and outcome.
 * 0 = perfect, 0.25 = random, 1 = max wrong (you said 1 it was 0).
 */
export const brierScore = (preds: ResolvedPrediction[]): number => {
  if (preds.length === 0) return 0;
  let sum = 0;
  for (const p of preds) {
    const o = p.correct ? 1 : 0;
    const c = clamp01(p.confidence);
    sum += (c - o) * (c - o);
  }
  return sum / preds.length;
};

/**
 * Log loss with clamping to avoid −Infinity for stated p ∈ {0, 1}.
 * Lower is better.
 */
export const logLoss = (preds: ResolvedPrediction[]): number => {
  if (preds.length === 0) return 0;
  let sum = 0;
  for (const p of preds) {
    const c = Math.min(1 - EPSILON, Math.max(EPSILON, clamp01(p.confidence)));
    sum += p.correct ? -Math.log(c) : -Math.log(1 - c);
  }
  return sum / preds.length;
};

/**
 * Group predictions into reliability bins. Empty bins are omitted.
 */
export const reliabilityBins = (
  preds: ResolvedPrediction[],
  binCount: number = DEFAULT_BIN_COUNT,
): ReliabilityBin[] => {
  const edges = makeBinEdges(binCount);
  const acc: { sumP: number; sumO: number; n: number }[] =
    edges.map(() => ({ sumP: 0, sumO: 0, n: 0 }));

  for (const p of preds) {
    const idx = findBinIndex(clamp01(p.confidence), binCount);
    acc[idx].sumP += clamp01(p.confidence);
    acc[idx].sumO += p.correct ? 1 : 0;
    acc[idx].n    += 1;
  }

  const out: ReliabilityBin[] = [];
  for (let i = 0; i < binCount; i++) {
    if (acc[i].n === 0) continue;
    out.push({
      from:           edges[i].from,
      to:             edges[i].to,
      meanConfidence: acc[i].sumP / acc[i].n,
      accuracy:       acc[i].sumO / acc[i].n,
      count:          acc[i].n,
    });
  }
  return out;
};

/**
 * Calibration index: 1 minus the count-weighted mean absolute gap between
 * stated confidence and observed accuracy across non-empty bins. 1 = perfect,
 * 0 = maximally miscalibrated.
 */
export const calibrationIndex = (bins: ReliabilityBin[]): number => {
  if (bins.length === 0) return 1;
  let totalN = 0;
  let weighted = 0;
  for (const b of bins) {
    totalN   += b.count;
    weighted += b.count * Math.abs(b.meanConfidence - b.accuracy);
  }
  if (totalN === 0) return 1;
  return clamp01(1 - weighted / totalN);
};

/**
 * Resolution (Murphy decomposition): how informative the predictions are,
 * measured as count-weighted variance of empirical accuracy across bins
 * around the global base rate. Higher = more discriminating.
 */
export const resolution = (
  preds: ResolvedPrediction[],
  bins: ReliabilityBin[],
): number => {
  if (preds.length === 0 || bins.length === 0) return 0;
  const baseRate = preds.reduce((a, p) => a + (p.correct ? 1 : 0), 0) / preds.length;
  let totalN = 0;
  let weighted = 0;
  for (const b of bins) {
    totalN   += b.count;
    weighted += b.count * (b.accuracy - baseRate) * (b.accuracy - baseRate);
  }
  if (totalN === 0) return 0;
  return weighted / totalN;
};

/**
 * Top-level convenience: compute the full report in one pass.
 */
export const summarise = (
  preds: ResolvedPrediction[],
  binCount: number = DEFAULT_BIN_COUNT,
): CalibrationReport => {
  const bins = reliabilityBins(preds, binCount);
  return {
    schemaVersion:    CALIBRATION_SCHEMA_VERSION,
    total:            preds.length,
    brier:            brierScore(preds),
    logLoss:          logLoss(preds),
    calibrationIndex: calibrationIndex(bins),
    resolution:       resolution(preds, bins),
    bins,
  };
};
