/**
 * Incident Cost Meter — pure cost math.
 *
 * Splits cost computation from data loading so the formula is
 * fully unit-testable without a database.
 */

export interface CostModel {
  currency: string;                // ISO 4217-ish code
  hourlyRateUsd: number;           // per responder, per hour
  slaBreachFlatUsd: number;        // applied once after SLA resolve target
  brandPerMinUsdBySeverity: Record<string, number>; // P1..P4 → $/min
  minResponders: number;           // floor on billed responders
}

export const DEFAULT_COST_MODEL: CostModel = {
  currency: 'USD',
  hourlyRateUsd: 120,
  slaBreachFlatUsd: 500,
  brandPerMinUsdBySeverity: { P1: 50, P2: 15, P3: 3, P4: 0.5 },
  minResponders: 1,
};

export interface CostInputs {
  severity: string;                // 'P1'..'P4'
  createdAt: Date;
  resolvedAt: Date | null;         // null while open
  /** Distinct user_ids that have appeared on the timeline. */
  distinctResponders: number;
  /** Tenant SLA resolve target for this severity, in minutes. null = no SLA configured. */
  slaResolveMinutes: number | null;
  /**
   * Customer-driven revenue impact, expressed as USD per HOUR.
   * Ticks only while the incident is open (resolvedAt === null).
   * null = no impact recorded.
   */
  revenuePerHourUsd: number | null;
  /** "Now" injected for determinism + unit tests. */
  now: Date;
}

export interface CostBreakdown {
  currency: string;
  elapsed_minutes: number;
  responders_billed: number;
  responder_cost: number;
  customer_impact_cost: number;
  brand_cost: number;
  sla_breach_cost: number;
  total: number;
  burn_rate_per_min: number;       // current $/min if still open, else 0
  /** Projected totals if the incident remains open this many more minutes. */
  projection: { plus_30_min: number; plus_60_min: number };
  inputs: {
    severity: string;
    is_open: boolean;
    sla_breached: boolean;
    sla_resolve_minutes: number | null;
    revenue_per_hour_usd: number | null;
    hourly_rate_usd: number;
  };
}

export function computeCost(model: CostModel, i: CostInputs): CostBreakdown {
  const endTime = i.resolvedAt ?? i.now;
  const elapsedMs = Math.max(0, endTime.getTime() - i.createdAt.getTime());
  const elapsedMin = Math.floor(elapsedMs / 60000);
  const elapsedHours = elapsedMs / 3_600_000;

  const responders = Math.max(i.distinctResponders, model.minResponders);
  const responderCost = round2(responders * model.hourlyRateUsd * elapsedHours);

  // Customer impact only ticks while open.
  const customerHours = i.resolvedAt
    ? Math.max(0, (i.resolvedAt.getTime() - i.createdAt.getTime()) / 3_600_000)
    : elapsedHours;
  const customerCost = round2(
    i.revenuePerHourUsd != null ? Math.max(0, i.revenuePerHourUsd) * customerHours : 0,
  );

  const brandPerMin = model.brandPerMinUsdBySeverity[i.severity] ?? 0;
  const brandCost = round2(brandPerMin * elapsedMin);

  const slaBreached =
    i.slaResolveMinutes != null && elapsedMin > i.slaResolveMinutes;
  const slaBreachCost = slaBreached ? round2(model.slaBreachFlatUsd) : 0;

  const total = round2(responderCost + customerCost + brandCost + slaBreachCost);

  const isOpen = i.resolvedAt === null;
  const burnPerMin = isOpen ? round2(currentBurnPerMin(model, i, responders, brandPerMin)) : 0;

  const projection = {
    plus_30_min: isOpen ? round2(total + burnPerMin * 30 + extraSlaIfBreaches(model, i, 30)) : total,
    plus_60_min: isOpen ? round2(total + burnPerMin * 60 + extraSlaIfBreaches(model, i, 60)) : total,
  };

  return {
    currency: model.currency,
    elapsed_minutes: elapsedMin,
    responders_billed: responders,
    responder_cost: responderCost,
    customer_impact_cost: customerCost,
    brand_cost: brandCost,
    sla_breach_cost: slaBreachCost,
    total,
    burn_rate_per_min: burnPerMin,
    projection,
    inputs: {
      severity: i.severity,
      is_open: isOpen,
      sla_breached: slaBreached,
      sla_resolve_minutes: i.slaResolveMinutes,
      revenue_per_hour_usd: i.revenuePerHourUsd,
      hourly_rate_usd: model.hourlyRateUsd,
    },
  };
}

/** Current $/minute burn rate for an open incident. */
function currentBurnPerMin(
  model: CostModel,
  i: CostInputs,
  responders: number,
  brandPerMin: number,
): number {
  const responderPerMin = (responders * model.hourlyRateUsd) / 60;
  const customerPerMin = (i.revenuePerHourUsd ?? 0) / 60;
  return responderPerMin + customerPerMin + brandPerMin;
}

/** If the incident hasn't breached SLA yet but will within `extraMin`, include the flat fee. */
function extraSlaIfBreaches(model: CostModel, i: CostInputs, extraMin: number): number {
  if (i.slaResolveMinutes == null) return 0;
  const elapsedMin = (i.now.getTime() - i.createdAt.getTime()) / 60000;
  const alreadyBreached = elapsedMin > i.slaResolveMinutes;
  if (alreadyBreached) return 0;                          // already counted in total
  if (elapsedMin + extraMin > i.slaResolveMinutes) return model.slaBreachFlatUsd;
  return 0;
}

function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}
