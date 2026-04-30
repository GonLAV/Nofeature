/**
 * Stakeholder Trust Decay Monitor \u2014 pure scoring functions.
 *
 * Trust collapses non-linearly with silence. We model it as:
 *
 *     ratio = gapMinutes / baselineMinutes
 *     overrun = max(0, ratio - 1)
 *     trust = clamp(1 - overrun * DECAY * severityFactor, 0, 1)
 *
 * `minutesToTrustLoss` solves the same equation for trust = TRUST_LOSS_FLOOR
 * so we can show "customers will start losing patience in ~7 min" before
 * it actually happens \u2014 the entire point of the feature.
 *
 * Every term must be defensible at 3am.
 */

export const TRUST_SCHEMA_VERSION  = 1;
export const TRUST_LOSS_FLOOR      = 0.5;
export const TRUST_DECAY_PER_RATIO = 0.45;

export type Audience = 'customers' | 'internal' | 'exec';
export type Severity = 'P1' | 'P2' | 'P3' | 'P4';

const SEVERITY_FACTOR: Record<Severity, number> = {
  P1: 1.5,
  P2: 1.0,
  P3: 0.6,
  P4: 0.3,
};

const AUDIENCE_FACTOR: Record<Audience, number> = {
  customers: 1.3,   // customers are least patient
  exec:      1.1,
  internal:  0.85,  // engineers cut each other slack
};

/**
 * Tenant defaults when there is no historical baseline yet for this
 * (audience, severity) pair. Conservative \u2014 favours staying quiet over
 * spamming \u2014 but still tight enough to surface real silence.
 */
export const FALLBACK_BASELINE: Record<Audience, Record<Severity, number>> = {
  customers: { P1: 8,  P2: 15, P3: 30, P4: 60 },
  internal:  { P1: 4,  P2: 8,  P3: 15, P4: 30 },
  exec:      { P1: 10, P2: 20, P3: 45, P4: 90 },
};

export interface PulseInput {
  audience:        Audience;
  severity:        Severity;
  gapMinutes:      number;
  baselineMinutes: number;
}

export interface PulseOutput {
  trustScore:           number;
  ratio:                number;
  minutesToTrustLoss:   number | null;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

export function scorePulse(input: PulseInput): PulseOutput {
  const baseline = Math.max(0.5, input.baselineMinutes);
  const ratio    = input.gapMinutes / baseline;
  const overrun  = Math.max(0, ratio - 1);
  const factor   = SEVERITY_FACTOR[input.severity] * AUDIENCE_FACTOR[input.audience];
  const trust    = clamp01(1 - overrun * TRUST_DECAY_PER_RATIO * factor);

  // Solve trust = TRUST_LOSS_FLOOR for the ratio at which collapse occurs:
  //   1 - (ratio - 1) * decay * factor = floor
  //   ratio = 1 + (1 - floor) / (decay * factor)
  const collapseRatio = 1 + (1 - TRUST_LOSS_FLOOR) / (TRUST_DECAY_PER_RATIO * factor);
  const collapseGap   = collapseRatio * baseline;
  const minutesLeft   = collapseGap - input.gapMinutes;

  let minutesToTrustLoss: number | null;
  if (trust <= TRUST_LOSS_FLOOR)       minutesToTrustLoss = null; // already lost
  else if (minutesLeft <= 0)           minutesToTrustLoss = null;
  else if (minutesLeft > 240)          minutesToTrustLoss = null; // beyond horizon
  else                                 minutesToTrustLoss = Math.round(minutesLeft);

  return { trustScore: trust, ratio, minutesToTrustLoss };
}

/**
 * Smoothed mean of historical baselines with a fallback prior.
 * Pulls the estimate toward the tenant default until we have enough
 * past samples for the per-tenant pattern to dominate.
 */
export function blendBaseline(
  audience:    Audience,
  severity:    Severity,
  samples:     number[],
  priorWeight  = 3,
): number {
  const fallback = FALLBACK_BASELINE[audience][severity];
  if (samples.length === 0) return fallback;
  const sum = samples.reduce((a, b) => a + b, 0);
  return (sum + fallback * priorWeight) / (samples.length + priorWeight);
}
