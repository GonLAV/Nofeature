-- Cycle 18: Confidence Gradient
-- Captures moment-by-moment "how well do we understand this incident?" so we
-- can compute a trajectory and flag inflection points (sudden drops = a clue
-- that broke our working model) as concrete learning artifacts.
--
-- Each row is a single confidence reading at a wall-clock instant during the
-- incident. Multiple readers per minute are fine; we aggregate at query time.

CREATE TABLE confidence_readings (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id)    ON DELETE CASCADE,
    incident_id     UUID NOT NULL REFERENCES incidents(id)  ON DELETE CASCADE,
    reader_id       UUID NOT NULL REFERENCES users(id)      ON DELETE CASCADE,
    -- 0.0 = "we have no idea what's happening"
    -- 1.0 = "we have a confirmed root cause and a working fix"
    confidence      NUMERIC(3,2) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    note            TEXT CHECK (char_length(note) <= 2000),
    recorded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    schema_version  SMALLINT    NOT NULL DEFAULT 1,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_confidence_readings_incident_time
    ON confidence_readings (incident_id, recorded_at);

CREATE INDEX idx_confidence_readings_tenant_time
    ON confidence_readings (tenant_id, recorded_at DESC);
