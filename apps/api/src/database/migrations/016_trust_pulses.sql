-- 016_trust_pulses.sql
-- Stakeholder Trust Decay Monitor.
--
-- Append-only snapshots of how long it has been since each audience
-- (customers, internal responders, exec) heard anything new on an
-- active incident, scored against the tenant's own historical
-- communication cadence.

CREATE TABLE IF NOT EXISTS trust_pulses (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                UUID NOT NULL REFERENCES tenants(id)   ON DELETE CASCADE,
  incident_id              UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  computed_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  audience                 TEXT NOT NULL CHECK (audience IN ('customers','internal','exec')),
  gap_minutes              REAL NOT NULL,
  baseline_minutes         REAL NOT NULL,
  trust_score              REAL NOT NULL CHECK (trust_score BETWEEN 0 AND 1),
  minutes_to_trust_loss    INT,
  inputs                   JSONB NOT NULL DEFAULT '{}'::jsonb,
  schema_version           SMALLINT NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_trust_pulses_incident
  ON trust_pulses (incident_id, computed_at DESC);

CREATE INDEX IF NOT EXISTS idx_trust_pulses_tenant
  ON trust_pulses (tenant_id, computed_at DESC);

CREATE INDEX IF NOT EXISTS idx_trust_pulses_audience
  ON trust_pulses (incident_id, audience, computed_at DESC);
