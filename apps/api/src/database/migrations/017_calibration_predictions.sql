-- Cycle 14: Confidence Calibration Index
-- Tracks responder confidence statements and resolves them against ground truth.
-- Lets us compute per-user Brier scores and reliability diagrams over time.

CREATE TABLE IF NOT EXISTS calibration_predictions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    incident_id     UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- The natural-language statement: "It's the primary DB pool exhaustion".
    statement       TEXT NOT NULL CHECK (length(statement) BETWEEN 1 AND 2000),

    -- Free-form bucket so we can slice calibration by domain
    -- ("root_cause" / "eta" / "blast_radius" / "fix_works" etc).
    category        TEXT NOT NULL CHECK (length(category) BETWEEN 1 AND 64),

    -- Stated probability that the statement is true, in [0, 1].
    confidence      DOUBLE PRECISION NOT NULL CHECK (confidence >= 0 AND confidence <= 1),

    -- NULL until adjudicated. true / false once we know the outcome.
    resolved_correct BOOLEAN,
    resolved_at      TIMESTAMPTZ,
    resolved_by      UUID REFERENCES users(id) ON DELETE SET NULL,
    resolution_note  TEXT CHECK (resolution_note IS NULL OR length(resolution_note) <= 2000),

    -- Schema-version stamp so downstream consumers can evolve safely.
    schema_version   SMALLINT NOT NULL DEFAULT 1,

    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Hot path: per-user calibration aggregation, newest first.
CREATE INDEX IF NOT EXISTS idx_calibration_user_created
    ON calibration_predictions (tenant_id, user_id, created_at DESC);

-- Per-incident lookup for the timeline UI.
CREATE INDEX IF NOT EXISTS idx_calibration_incident
    ON calibration_predictions (tenant_id, incident_id, created_at DESC);

-- "What's still un-adjudicated?" queue for managers.
CREATE INDEX IF NOT EXISTS idx_calibration_unresolved
    ON calibration_predictions (tenant_id, created_at DESC)
    WHERE resolved_correct IS NULL;

-- Per-tenant category slicing.
CREATE INDEX IF NOT EXISTS idx_calibration_category
    ON calibration_predictions (tenant_id, category, created_at DESC);
