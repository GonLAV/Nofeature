-- ─────────────────────────────────────────────────────────────
-- Migration: 016_incident_cost
-- Live Incident Cost Meter — per-tenant cost model used by the
-- /api/v1/incidents/:id/cost endpoint to compute a live $ ticker.
--
-- All amounts are stored in the tenant's chosen currency (default
-- USD). Defaults are intentionally conservative; tenants override
-- via PUT /api/v1/cost-model.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tenant_cost_models (
  tenant_id              UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  currency               CHAR(3)        NOT NULL DEFAULT 'USD',
  -- Average loaded engineer cost per hour, applied to every distinct
  -- responder that touched the incident timeline.
  hourly_rate_usd        NUMERIC(10,2)  NOT NULL DEFAULT 120.00,
  -- Flat penalty applied once when the incident crosses its SLA
  -- resolve target (from sla_targets), independent of severity.
  sla_breach_flat_usd    NUMERIC(12,2)  NOT NULL DEFAULT 500.00,
  -- Brand / reputation cost per minute, by severity. Ticks only
  -- while the incident is open.
  brand_per_min_p1_usd   NUMERIC(10,2)  NOT NULL DEFAULT 50.00,
  brand_per_min_p2_usd   NUMERIC(10,2)  NOT NULL DEFAULT 15.00,
  brand_per_min_p3_usd   NUMERIC(10,2)  NOT NULL DEFAULT 3.00,
  brand_per_min_p4_usd   NUMERIC(10,2)  NOT NULL DEFAULT 0.50,
  -- Floor on number of responders billed against an open incident
  -- (e.g. 1 = always at least one on-call eating cost).
  min_responders         SMALLINT       NOT NULL DEFAULT 1
                          CHECK (min_responders >= 0 AND min_responders <= 50),
  created_at             TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_tenant_cost_models_updated
  BEFORE UPDATE ON tenant_cost_models
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
