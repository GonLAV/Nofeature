/**
 * Cognitive Debt Ledger \u2014 pure interest math.
 *
 * Each debt item carries:
 *   principal   1\u201310    self-declared "size" of the shortcut
 *   surface     1\u20135    how many systems / customers it touches
 *   severity              of the originating incident (rate factor)
 *   age in days           continuous compounding
 *
 * Interest formula (continuously compounding, capped):
 *
 *     rate   = severityRate * surfaceFactor
 *     accrued = principal * (exp(rate * ageYears) - 1)
 *     accrued = min(accrued, principal * MAX_MULTIPLIER)
 *
 * Capping at MAX_MULTIPLIER prevents runaway numbers on debts that
 * have been on the books for years \u2014 the ledger is a decision-support
 * tool, not a hyperinflation simulator.
 */

export const DEBT_SCHEMA_VERSION = 1;
export const MAX_MULTIPLIER      = 4;        // accrued interest is capped at 4x principal
export const HORIZON_DAYS        = 180;      // half-life forecast horizon

export type DebtCategory =
  | 'rate_limit_raised'
  | 'feature_flag_flipped'
  | 'retry_added'
  | 'capacity_scaled'
  | 'alert_silenced'
  | 'monkey_patch'
  | 'config_override'
  | 'data_repaired'
  | 'rollback'
  | 'other';

export type Severity = 'P1' | 'P2' | 'P3' | 'P4';

const SEVERITY_RATE: Record<Severity, number> = {
  P1: 1.20,
  P2: 0.80,
  P3: 0.45,
  P4: 0.20,
};

const CATEGORY_RATE_BIAS: Record<DebtCategory, number> = {
  rate_limit_raised:    1.10,
  feature_flag_flipped: 0.85,
  retry_added:          1.15,
  capacity_scaled:      0.90,
  alert_silenced:       1.40,  // silenced alerts are the most dangerous
  monkey_patch:         1.25,
  config_override:      1.00,
  data_repaired:        0.80,
  rollback:             0.70,
  other:                1.00,
};

export interface DebtItem {
  principal:               number;
  surface:                 number;
  severityAtDeclaration:   Severity;
  category:                DebtCategory;
  declaredAt:              Date;
  repaidAt?:               Date | null;
}

export interface DebtSnapshot {
  principal:    number;
  accrued:      number;
  total:        number;     // principal + accrued (still on the books)
  ageDays:      number;
  ratePerYear:  number;
  capped:       boolean;
}

const surfaceFactor = (surface: number) => 0.7 + 0.15 * Math.max(1, Math.min(5, surface));

export function ratePerYear(item: Pick<DebtItem, 'severityAtDeclaration' | 'surface' | 'category'>): number {
  return SEVERITY_RATE[item.severityAtDeclaration]
       * surfaceFactor(item.surface)
       * CATEGORY_RATE_BIAS[item.category];
}

/**
 * Computes the total balance (principal + capped accrued interest) as of `now`.
 * Returns zero accrued for repaid debts.
 */
export function computeBalance(item: DebtItem, now: Date = new Date()): DebtSnapshot {
  if (item.repaidAt) {
    return {
      principal:   item.principal,
      accrued:     0,
      total:       item.principal,
      ageDays:     (item.repaidAt.getTime() - item.declaredAt.getTime()) / 86_400_000,
      ratePerYear: ratePerYear(item),
      capped:      false,
    };
  }

  const ageDays  = Math.max(0, (now.getTime() - item.declaredAt.getTime()) / 86_400_000);
  const ageYears = ageDays / 365.25;
  const r        = ratePerYear(item);
  const raw      = item.principal * (Math.exp(r * ageYears) - 1);
  const cap      = item.principal * MAX_MULTIPLIER;
  const accrued  = Math.min(raw, cap);

  return {
    principal:   item.principal,
    accrued,
    total:       item.principal + accrued,
    ageDays,
    ratePerYear: r,
    capped:      raw >= cap,
  };
}

export interface PortfolioSummary {
  openCount:          number;
  repaidCount:        number;
  principalOutstanding: number;
  accruedOutstanding:   number;
  totalOutstanding:     number;
  /** Forecasted additional interest over the next HORIZON_DAYS at current rate, no new repayments. */
  horizonRisk:        number;
  /** Empirical median repayment time across the historical (repaid) corpus, in days. NaN if none. */
  medianRepaymentDays:number;
  /** Per-category outstanding totals (sorted desc inside the caller if needed). */
  byCategory:         Record<string, number>;
}

const median = (values: number[]): number => {
  if (values.length === 0) return NaN;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
};

export function summarisePortfolio(items: DebtItem[], now: Date = new Date()): PortfolioSummary {
  const open    = items.filter((i) => !i.repaidAt);
  const repaid  = items.filter((i) =>  i.repaidAt);

  let principalOutstanding = 0;
  let accruedOutstanding   = 0;
  let horizonRisk          = 0;
  const byCategory: Record<string, number> = {};

  for (const item of open) {
    const snap = computeBalance(item, now);
    principalOutstanding += snap.principal;
    accruedOutstanding   += snap.accrued;
    byCategory[item.category] = (byCategory[item.category] ?? 0) + snap.total;

    // Forecast: project balance HORIZON_DAYS into the future, subtract today's accrued.
    const future = computeBalance(
      item,
      new Date(now.getTime() + HORIZON_DAYS * 86_400_000),
    );
    horizonRisk += future.accrued - snap.accrued;
  }

  const medianRepaymentDays = median(
    repaid.map((i) => (i.repaidAt!.getTime() - i.declaredAt.getTime()) / 86_400_000),
  );

  return {
    openCount:            open.length,
    repaidCount:          repaid.length,
    principalOutstanding,
    accruedOutstanding,
    totalOutstanding:     principalOutstanding + accruedOutstanding,
    horizonRisk,
    medianRepaymentDays,
    byCategory,
  };
}
