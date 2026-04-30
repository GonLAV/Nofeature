/**
 * Reliability Treasury \u2014 pure math.
 *
 * Treats the SLO error-budget for a service as a checking account:
 *   balance:     minutes of error budget remaining in the window
 *   burn rate:   minutes withdrawn per day (rolling 7d)
 *   runway:      balance / burn rate (in days)
 *   interest:    small reward for clean weeks (compounds slowly)
 *
 * Recommendation thresholds turn the raw numbers into an action.
 */

export const TREASURY_SCHEMA_VERSION = 1;

export const FREEZE_RUNWAY_DAYS  = 3;
export const CAUTION_RUNWAY_DAYS = 10;

/** Tiny interest rate, applied per clean week, capped at original budget. */
export const CLEAN_WEEK_INTEREST = 0.01;   // 1% of budget per clean week
export const MAX_INTEREST_RATIO  = 0.10;   // cannot exceed +10% of budget

/** Translate an SLO target (e.g. 0.999) over a window in days into budget minutes. */
export function budgetMinutes(sloTarget: number, windowDays: number): number {
  if (sloTarget <= 0 || sloTarget >= 1) throw new Error('sloTarget must be in (0,1)');
  if (windowDays <= 0)                  throw new Error('windowDays must be positive');
  const totalMinutes = windowDays * 24 * 60;
  return totalMinutes * (1 - sloTarget);
}

export type LedgerKind = 'withdrawal' | 'deposit' | 'interest' | 'adjustment';

export interface LedgerEntry {
  kind:      LedgerKind;
  minutes:   number;     // signed: withdrawals are negative
  createdAt: Date;
}

/**
 * Returns burn rate in minutes/day computed from withdrawals only,
 * over the last `windowDays` days (default 7).
 */
export function burnRate(entries: LedgerEntry[], windowDays = 7, now: Date = new Date()): number {
  if (windowDays <= 0) return 0;
  const cutoff   = now.getTime() - windowDays * 86_400_000;
  let withdrawn  = 0;
  for (const e of entries) {
    if (e.createdAt.getTime() < cutoff) continue;
    if (e.kind === 'withdrawal') withdrawn += Math.abs(e.minutes);
  }
  return withdrawn / windowDays;
}

/**
 * Days until balance hits zero at current burn rate.
 * Returns Infinity when the burn rate is zero (or negative).
 */
export function runwayDays(balance: number, burnPerDay: number): number {
  if (burnPerDay <= 1e-9) return Infinity;
  if (balance <= 0)       return 0;
  return balance / burnPerDay;
}

export type Recommendation = 'healthy' | 'caution' | 'freeze';

export function recommend(balance: number, burnPerDay: number): {
  status: Recommendation;
  runway: number;
  reason: string;
} {
  const runway = runwayDays(balance, burnPerDay);

  if (balance <= 0) {
    return { status: 'freeze',  runway: 0, reason: 'Error budget exhausted.' };
  }
  if (runway <= FREEZE_RUNWAY_DAYS) {
    return { status: 'freeze',  runway,
             reason: `Runway ${runway.toFixed(1)}d \u2264 ${FREEZE_RUNWAY_DAYS}d freeze threshold.` };
  }
  if (runway <= CAUTION_RUNWAY_DAYS) {
    return { status: 'caution', runway,
             reason: `Runway ${runway.toFixed(1)}d \u2264 ${CAUTION_RUNWAY_DAYS}d caution threshold.` };
  }
  return { status: 'healthy', runway, reason: 'Burn rate sustainable.' };
}

/**
 * Computes interest credit for `cleanDays` consecutive days without withdrawals.
 * Capped at MAX_INTEREST_RATIO of the original budget.
 */
export function interestCredit(budget: number, cleanDays: number): number {
  if (cleanDays < 7 || budget <= 0) return 0;
  const weeks = Math.floor(cleanDays / 7);
  const raw   = budget * CLEAN_WEEK_INTEREST * weeks;
  return Math.min(raw, budget * MAX_INTEREST_RATIO);
}

export interface TreasuryAccountView {
  budget:        number;
  balance:       number;
  burn:          number;
  runway:        number;
  recommendation: Recommendation;
  reason:        string;
  utilization:   number;  // 0..1, how much of the budget has been spent
}

export function summariseAccount(opts: {
  budget:  number;
  balance: number;
  entries: LedgerEntry[];
  now?:    Date;
}): TreasuryAccountView {
  const burn   = burnRate(opts.entries, 7, opts.now);
  const rec    = recommend(opts.balance, burn);
  const util   = opts.budget > 0
    ? Math.max(0, Math.min(1, 1 - opts.balance / opts.budget))
    : 0;
  return {
    budget:         opts.budget,
    balance:        opts.balance,
    burn,
    runway:         rec.runway,
    recommendation: rec.status,
    reason:         rec.reason,
    utilization:    util,
  };
}
