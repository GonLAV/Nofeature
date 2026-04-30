-- 016_convergence_scores.sql
-- Resolution Convergence Index.
--
-- Measures whether an active incident is *progressing toward
-- resolution* (vs. spinning). Append-only snapshots scored against
-- four signals: action-vs-discussion ratio, scope narrowing,
-- decision stability, cadence acceleration.

CREATE TABLE IF NOT EXISTS convergence_scores (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                UUID NOT NULL REFERENCES tenants(id)   ON DELETE CASCADE,
  incident_id              UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  computed_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  score                    REAL NOT NULL CHECK (score BETWEEN 0 AND 1),
  diagnosis                TEXT NOT NULL CHECK (diagnosis IN ('converging','holding','stuck','diverging')),
  velocity_per_min         REAL NOT NULL,           -- d(score)/d(min) over recent window
  minutes_to_resolution    INT,                     -- forward ETA when converging, else NULL
  stuck_minutes            INT NOT NULL DEFAULT 0,  -- consecutive minutes spent at low score

  signals                  JSONB NOT NULL DEFAULT '{}'::jsonb,
  schema_version           SMALLINT NOT NULL DEFAULT 1,

  -- Post-mortem calibration
  actual_minutes_to_resolve INT,
  resolution_residual       INT
);

CREATE INDEX IF NOT EXISTS idx_convergence_incident
  ON convergence_scores (incident_id, computed_at DESC);

CREATE INDEX IF NOT EXISTS idx_convergence_tenant
  ON convergence_scores (tenant_id, computed_at DESC);

CREATE INDEX IF NOT EXISTS idx_convergence_diagnosis
  ON convergence_scores (tenant_id, diagnosis, computed_at DESC);
