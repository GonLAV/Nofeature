-- Cycle 15: Failure Mode DNA & Mitigation Memory
-- Captures structured failure-mode tags and mitigation tactics on incidents
-- so that recurring patterns and proven counter-measures become first-class
-- objects rather than buried postmortem prose.

CREATE TABLE IF NOT EXISTS failure_modes (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    -- Slug like 'cascading-timeout', 'thundering-herd', 'poison-message'.
    slug        TEXT NOT NULL CHECK (slug ~ '^[a-z][a-z0-9-]{1,63}$'),
    label       TEXT NOT NULL CHECK (length(label) BETWEEN 1 AND 120),
    description TEXT CHECK (description IS NULL OR length(description) <= 4000),
    schema_version SMALLINT NOT NULL DEFAULT 1,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, slug)
);

CREATE TABLE IF NOT EXISTS mitigations (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    slug        TEXT NOT NULL CHECK (slug ~ '^[a-z][a-z0-9-]{1,63}$'),
    label       TEXT NOT NULL CHECK (length(label) BETWEEN 1 AND 120),
    description TEXT CHECK (description IS NULL OR length(description) <= 4000),
    schema_version SMALLINT NOT NULL DEFAULT 1,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, slug)
);

-- N-to-N link: incident <-> failure mode, with how confident the tagger was.
CREATE TABLE IF NOT EXISTS incident_failure_modes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    incident_id     UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    failure_mode_id UUID NOT NULL REFERENCES failure_modes(id) ON DELETE CASCADE,
    confidence      DOUBLE PRECISION NOT NULL DEFAULT 1.0
                      CHECK (confidence >= 0 AND confidence <= 1),
    tagged_by       UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (incident_id, failure_mode_id)
);

-- N-to-N link: incident <-> mitigation, plus the *outcome* of applying it.
-- effective: true  → MTTR clearly dropped / outage stopped
-- effective: false → tried and didn't help
-- effective: NULL  → applied but unevaluated
CREATE TABLE IF NOT EXISTS incident_mitigations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    incident_id     UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    mitigation_id   UUID NOT NULL REFERENCES mitigations(id) ON DELETE CASCADE,
    effective       BOOLEAN,
    mttr_delta_seconds  INTEGER, -- negative = MTTR improved
    notes           TEXT CHECK (notes IS NULL OR length(notes) <= 4000),
    applied_by      UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (incident_id, mitigation_id)
);

CREATE INDEX IF NOT EXISTS idx_ifm_tenant_mode_created
    ON incident_failure_modes (tenant_id, failure_mode_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ifm_incident
    ON incident_failure_modes (incident_id);

CREATE INDEX IF NOT EXISTS idx_im_tenant_mit_created
    ON incident_mitigations (tenant_id, mitigation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_im_incident
    ON incident_mitigations (incident_id);
CREATE INDEX IF NOT EXISTS idx_im_effective
    ON incident_mitigations (tenant_id, mitigation_id)
    WHERE effective IS NOT NULL;
