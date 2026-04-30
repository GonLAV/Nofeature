-- 016_blast_forecasts.sql
-- Blast Radius Forecaster \u2014 forward-looking projection of how an
-- incident's customer impact will grow if nothing changes.
--
-- Forecasts are append-only snapshots, recomputed whenever a new
-- timeline event lands. Keeping the history is what unlocks
-- post-incident calibration: once an incident resolves we score
-- each forecast against what actually happened and feed the
-- residual back into per-tenant tuning.

CREATE TABLE IF NOT EXISTS blast_forecasts (
  id                       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                UUID         NOT NULL REFERENCES tenants(id)   ON DELETE CASCADE,
  incident_id              UUID         NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  computed_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  -- Headline outputs:
  current_radius           REAL         NOT NULL,            -- 0..1 normalised radius right now
  growth_rate_per_min      REAL         NOT NULL,            -- d(radius)/d(min); can be negative
  projected_radius_30min   REAL         NOT NULL,            -- linear projection clamped [0,1]
  minutes_to_customer      INT,                              -- ETA to first customer-visible symptom; null = already over threshold
  minutes_to_p1_escalation INT,                              -- ETA to escalation threshold;          null = already there

  confidence               REAL         NOT NULL,            -- 0..1, drops with sparse signal
  inputs                   JSONB        NOT NULL DEFAULT '{}'::jsonb,
  schema_version           SMALLINT     NOT NULL DEFAULT 1,

  -- Post-mortem accuracy fields (populated on resolve):
  actual_peak_radius       REAL,
  forecast_residual        REAL                              -- actual - projected_radius_30min
);

-- Latest forecast per incident is the hot read path.
CREATE INDEX IF NOT EXISTS idx_blast_forecasts_latest
  ON blast_forecasts (incident_id, computed_at DESC);

-- Tenant-wide trend / calibration scans.
CREATE INDEX IF NOT EXISTS idx_blast_forecasts_tenant
  ON blast_forecasts (tenant_id, computed_at DESC);
