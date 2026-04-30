/**
 * Blast Radius Forecaster \u2014 pure math.
 *
 * The model is intentionally simple and *interpretable*. We measure
 * the radius right now from a small basket of signals, estimate its
 * recent slope from a sliding window of past samples, then project
 * forward linearly with a confidence cap that decays as the signal
 * gets sparser.
 *
 * "Why not deep learning?" Because at 3am the on-call needs to
 * trust the number, and trust comes from auditability. Every term
 * in this file maps to a thing a human can defend in a post-mortem.
 *
 * Customer-impact threshold: empirically the moment people start
 * tweeting / opening tickets is around radius \u2248 0.45. P1-escalation
 * conversations start around 0.65.
 */

export const FORECAST_SCHEMA_VERSION = 1;

export const CUSTOMER_IMPACT_THRESHOLD   = 0.45;
export const P1_ESCALATION_THRESHOLD     = 0.65;

export interface ForecastInput {
  /** Severity at the moment of forecast. */
  severity: 'P1' | 'P2' | 'P3' | 'P4';

  /** Number of distinct affected_systems on the incident. */
  affectedSystems: number;

  /** Distinct services attached. */
  serviceCount: number;

  /** Number of timeline events in the last 5 minutes. Burst = fast growth. */
  timelineEventsLast5min: number;

  /** Comments in the last 5 minutes. Crowd-panic indicator. */
  commentsLast5min: number;

  /** Distinct status transitions seen so far (more = more thrashing). */
  distinctStatusValues: number;

  /** Minutes since the incident was opened. */
  ageMinutes: number;

  /**
   * Recent radius samples (oldest first), sampled at \u22651min apart.
   * Used to estimate growth rate. Pass [] on cold start.
   */
  recentSamples: { capturedAt: Date; radius: number }[];
}

export interface ForecastOutput {
  currentRadius:           number;   // 0..1
  growthRatePerMin:        number;   // can be negative (recovering)
  projectedRadius30min:    number;   // 0..1
  minutesToCustomerImpact: number | null;
  minutesToP1Escalation:   number | null;
  confidence:              number;   // 0..1
  components: {
    severityFloor:    number;
    blastWidth:       number;
    velocity:         number;
    panic:            number;
    statusThrash:     number;
  };
}

/* \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

const SEVERITY_FLOOR: Record<ForecastInput['severity'], number> = {
  P1: 0.55,   // a P1 starts already past the customer-impact threshold
  P2: 0.30,
  P3: 0.10,
  P4: 0.02,
};

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);
const finiteOrZero = (n: number) =>
  Number.isFinite(n) && n > 0 ? n : 0;

export function computeRadius(input: ForecastInput): {
  radius: number;
  components: ForecastOutput['components'];
} {
  const severityFloor = SEVERITY_FLOOR[input.severity];

  // Blast width: combined breadth of impact, soft-capped.
  const systemsNorm  = Math.min(1, finiteOrZero(input.affectedSystems) / 8);
  const servicesNorm = Math.min(1, finiteOrZero(input.serviceCount)    / 8);
  const blastWidth   = (systemsNorm * 0.6 + servicesNorm * 0.4) * 0.35;

  // Velocity: timeline burst in last 5 min. 10 events in 5 min \u2192 saturated.
  const velocity = Math.min(1, finiteOrZero(input.timelineEventsLast5min) / 10) * 0.20;

  // Panic: people typing furiously. 25 comments / 5 min \u2192 saturated.
  const panic = Math.min(1, finiteOrZero(input.commentsLast5min) / 25) * 0.15;

  // Status thrash: open\u2192investigating\u2192open\u2192investigating chaos.
  const statusThrash = Math.min(1, Math.max(0, finiteOrZero(input.distinctStatusValues) - 1) / 3) * 0.10;

  const radius = clamp01(severityFloor + blastWidth + velocity + panic + statusThrash);

  return {
    radius,
    components: { severityFloor, blastWidth, velocity, panic, statusThrash },
  };
}

/**
 * Estimate growth rate (units per minute) from recent samples using a
 * simple least-squares slope. Ignores degenerate cases.
 */
export function estimateGrowthRate(
  samples: { capturedAt: Date; radius: number }[],
): number {
  if (!samples || samples.length < 2) return 0;

  // x = minutes since first sample
  const t0 = samples[0].capturedAt.getTime();
  const xs = samples.map((s) => (s.capturedAt.getTime() - t0) / 60_000);
  const ys = samples.map((s) => s.radius);
  const n  = samples.length;

  const sumX  = xs.reduce((a, b) => a + b, 0);
  const sumY  = ys.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((a, b, i) => a + b * ys[i], 0);
  const sumXX = xs.reduce((a, b) => a + b * b, 0);

  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return 0;

  const slope = (n * sumXY - sumX * sumY) / denom;
  return Number.isFinite(slope) ? slope : 0;
}

/**
 * Solve for "minutes until radius crosses threshold" given a linear
 * projection. Returns null if already past, or if growth is not
 * positive enough to ever cross within the projection horizon.
 */
export function minutesToThreshold(
  currentRadius: number,
  growthPerMin:  number,
  threshold:     number,
  horizonMin    = 120,
): number | null {
  if (currentRadius >= threshold) return null;          // already over
  if (growthPerMin <= 0)          return null;          // not growing
  const eta = (threshold - currentRadius) / growthPerMin;
  if (!Number.isFinite(eta) || eta < 0 || eta > horizonMin) return null;
  return Math.round(eta);
}

/** Confidence drops with sparse history, very young incidents, or zero growth. */
export function estimateConfidence(input: ForecastInput, growthPerMin: number): number {
  // Need at least a few samples for stable slope estimation.
  const sampleConf = Math.min(1, input.recentSamples.length / 5);
  // Very young incidents (< 3 min) carry little forward signal.
  const ageConf    = Math.min(1, input.ageMinutes / 3);
  // Flat-line forecasts shouldn't claim high confidence in any ETA.
  const motionConf = Math.min(1, Math.abs(growthPerMin) / 0.05);
  return clamp01(0.4 * sampleConf + 0.3 * ageConf + 0.3 * motionConf);
}

export function forecast(input: ForecastInput): ForecastOutput {
  const { radius, components } = computeRadius(input);
  const growthRatePerMin       = estimateGrowthRate(input.recentSamples);
  const projectedRadius30min   = clamp01(radius + growthRatePerMin * 30);
  const confidence             = estimateConfidence(input, growthRatePerMin);

  return {
    currentRadius:           radius,
    growthRatePerMin,
    projectedRadius30min,
    minutesToCustomerImpact: minutesToThreshold(radius, growthRatePerMin, CUSTOMER_IMPACT_THRESHOLD),
    minutesToP1Escalation:   minutesToThreshold(radius, growthRatePerMin, P1_ESCALATION_THRESHOLD),
    confidence,
    components,
  };
}
