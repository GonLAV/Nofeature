-- Cycle 16: Hypothesis Ledger
-- Treats each incident as a scientific investigation: every theory about
-- "what's broken" is a first-class object with status, evidence, and
-- timestamps so we can measure investigation efficiency post-hoc.

CREATE TABLE IF NOT EXISTS hypotheses (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    incident_id     UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    statement       TEXT NOT NULL CHECK (length(statement) BETWEEN 1 AND 1000),
    status          TEXT NOT NULL DEFAULT 'open'
                      CHECK (status IN ('open', 'confirmed', 'refuted')),
    created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    settled_by      UUID REFERENCES users(id) ON DELETE SET NULL,
    settled_at      TIMESTAMPTZ,
    settled_reason  TEXT CHECK (settled_reason IS NULL OR length(settled_reason) <= 4000),
    schema_version  SMALLINT NOT NULL DEFAULT 1,
    -- A settled hypothesis must have a settled_at; an open one must not.
    CHECK ((status = 'open' AND settled_at IS NULL) OR
           (status <> 'open' AND settled_at IS NOT NULL))
);

-- At most one confirmed hypothesis per incident.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_hypothesis_confirmed_per_incident
    ON hypotheses (incident_id)
    WHERE status = 'confirmed';

CREATE INDEX IF NOT EXISTS idx_hypotheses_incident_created
    ON hypotheses (tenant_id, incident_id, created_at DESC);

CREATE TABLE IF NOT EXISTS hypothesis_evidence (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    hypothesis_id UUID NOT NULL REFERENCES hypotheses(id) ON DELETE CASCADE,
    kind          TEXT NOT NULL
                    CHECK (kind IN ('link', 'note', 'metric', 'log')),
    content       TEXT NOT NULL CHECK (length(content) BETWEEN 1 AND 4000),
    created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_evidence_hypothesis_created
    ON hypothesis_evidence (hypothesis_id, created_at DESC);
