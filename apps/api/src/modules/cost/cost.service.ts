/**
 * Incident Cost Meter — DB-bound service layer.
 *
 * Loads the per-tenant cost model (with safe defaults if no row),
 * SLA target, distinct responder count, and incident facts, then
 * delegates to the pure `computeCost()` formula.
 */

import db from '../../config/database';
import { logger } from '../../utils/logger';
import {
  CostModel, CostInputs, CostBreakdown, DEFAULT_COST_MODEL, computeCost,
} from './cost.compute';

interface IncidentRow {
  id: string;
  severity: string;
  created_at: Date;
  resolved_at: Date | null;
  revenue_impact_usd: string | null;   // numeric → string from pg
}

/** Loads an effective cost model for a tenant, falling back to defaults. */
export async function loadCostModel(tenantId: string): Promise<CostModel> {
  try {
    const { rows } = await db.query(
      `SELECT currency, hourly_rate_usd, sla_breach_flat_usd,
              brand_per_min_p1_usd, brand_per_min_p2_usd,
              brand_per_min_p3_usd, brand_per_min_p4_usd,
              min_responders
         FROM tenant_cost_models
        WHERE tenant_id = $1`,
      [tenantId],
    );
    if (rows.length === 0) return { ...DEFAULT_COST_MODEL };
    const r = rows[0];
    return {
      currency: r.currency || 'USD',
      hourlyRateUsd: Number(r.hourly_rate_usd),
      slaBreachFlatUsd: Number(r.sla_breach_flat_usd),
      brandPerMinUsdBySeverity: {
        P1: Number(r.brand_per_min_p1_usd),
        P2: Number(r.brand_per_min_p2_usd),
        P3: Number(r.brand_per_min_p3_usd),
        P4: Number(r.brand_per_min_p4_usd),
      },
      minResponders: Number(r.min_responders),
    };
  } catch (e) {
    // Migration 016 may not have run yet — degrade to defaults.
    logger.warn('cost.model.unavailable', { error: (e as Error).message });
    return { ...DEFAULT_COST_MODEL };
  }
}

/**
 * Persists (insert or update) a tenant's cost model.
 * Validation is enforced at the route layer via Zod.
 */
export async function saveCostModel(tenantId: string, model: CostModel): Promise<void> {
  await db.query(
    `INSERT INTO tenant_cost_models (
        tenant_id, currency, hourly_rate_usd, sla_breach_flat_usd,
        brand_per_min_p1_usd, brand_per_min_p2_usd,
        brand_per_min_p3_usd, brand_per_min_p4_usd, min_responders
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (tenant_id) DO UPDATE SET
        currency = EXCLUDED.currency,
        hourly_rate_usd = EXCLUDED.hourly_rate_usd,
        sla_breach_flat_usd = EXCLUDED.sla_breach_flat_usd,
        brand_per_min_p1_usd = EXCLUDED.brand_per_min_p1_usd,
        brand_per_min_p2_usd = EXCLUDED.brand_per_min_p2_usd,
        brand_per_min_p3_usd = EXCLUDED.brand_per_min_p3_usd,
        brand_per_min_p4_usd = EXCLUDED.brand_per_min_p4_usd,
        min_responders = EXCLUDED.min_responders`,
    [
      tenantId,
      model.currency,
      model.hourlyRateUsd,
      model.slaBreachFlatUsd,
      model.brandPerMinUsdBySeverity.P1 ?? 0,
      model.brandPerMinUsdBySeverity.P2 ?? 0,
      model.brandPerMinUsdBySeverity.P3 ?? 0,
      model.brandPerMinUsdBySeverity.P4 ?? 0,
      model.minResponders,
    ],
  );
}

/**
 * Computes the live cost breakdown for an incident.
 * Throws { status: 404 } if the incident is not found in this tenant.
 */
export async function computeIncidentCost(
  tenantId: string,
  incidentId: string,
  now: Date = new Date(),
): Promise<CostBreakdown> {
  const inc = await db.query(
    `SELECT id, severity, created_at, resolved_at, revenue_impact_usd
       FROM incidents
      WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
    [incidentId, tenantId],
  );
  if (inc.rows.length === 0) {
    const err: Error & { status?: number } = new Error('incident not found');
    err.status = 404;
    throw err;
  }
  const r = inc.rows[0] as IncidentRow;

  const [responders, slaTarget, model] = await Promise.all([
    countDistinctResponders(tenantId, incidentId),
    loadSlaResolveMinutes(tenantId, r.severity),
    loadCostModel(tenantId),
  ]);

  // `revenue_impact_usd` is interpreted as USD per HOUR of unresolved impact.
  // Documented in API responses via inputs.revenue_per_hour_usd.
  const revenuePerHour =
    r.revenue_impact_usd != null ? Number(r.revenue_impact_usd) : null;

  const inputs: CostInputs = {
    severity: r.severity,
    createdAt: new Date(r.created_at),
    resolvedAt: r.resolved_at ? new Date(r.resolved_at) : null,
    distinctResponders: responders,
    slaResolveMinutes: slaTarget,
    revenuePerHourUsd: revenuePerHour,
    now,
  };

  return computeCost(model, inputs);
}

async function countDistinctResponders(tenantId: string, incidentId: string): Promise<number> {
  const { rows } = await db.query(
    `SELECT COUNT(DISTINCT user_id)::text AS n
       FROM incident_timeline
      WHERE tenant_id = $1 AND incident_id = $2 AND user_id IS NOT NULL`,
    [tenantId, incidentId],
  );
  return rows[0] ? Number((rows[0] as { n: string }).n) : 0;
}

async function loadSlaResolveMinutes(
  tenantId: string,
  severity: string,
): Promise<number | null> {
  try {
    const { rows } = await db.query(
      `SELECT resolve_minutes FROM sla_targets
        WHERE tenant_id = $1 AND severity = $2`,
      [tenantId, severity],
    );
    return rows[0] ? Number((rows[0] as { resolve_minutes: number }).resolve_minutes) : null;
  } catch {
    return null;
  }
}
