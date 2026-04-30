-- Cycle 19: Drift Watch
-- Captures changes to mutable framing fields on an incident (title,
-- description, severity, affected_systems) so we can quantify "scope drift"
-- during the lifetime of an incident and flag mis-scoped issues.

CREATE TABLE incident_drift_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id)   ON DELETE CASCADE,
    incident_id     UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    actor_id        UUID REFERENCES users(id)              ON DELETE SET NULL,
    field           TEXT NOT NULL CHECK (field IN ('title','description','severity','affected_systems')),
    -- We store JSONB on both sides so arrays and strings live together.
    previous_value  JSONB,
    next_value      JSONB,
    -- Magnitude is callable by the writer (jaccard distance, char-edit ratio,
    -- or 1 for severity hops). Always 0..1 so we can sum drift.
    magnitude       NUMERIC(4,3) NOT NULL CHECK (magnitude >= 0 AND magnitude <= 1),
    schema_version  SMALLINT NOT NULL DEFAULT 1,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_drift_events_incident_time
    ON incident_drift_events (incident_id, created_at);

CREATE INDEX idx_drift_events_tenant_time
    ON incident_drift_events (tenant_id, created_at DESC);
