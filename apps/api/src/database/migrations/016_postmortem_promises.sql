-- 016_postmortem_promises.sql
-- Postmortem Promise Ledger.
--
-- Captures action items committed to in postmortems as first-class
-- "promises" with an owner, due date, and lifecycle. Tracks recurrence
-- when an incident's genome matches a past incident whose promises
-- were broken.

CREATE TABLE IF NOT EXISTS postmortem_promises (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    incident_id     UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    title           TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 280),
    detail          TEXT CHECK (detail IS NULL OR char_length(detail) <= 4000),
    owner_id        UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    due_date        DATE NOT NULL,
    status          TEXT NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open','kept','broken','cancelled')),
    kept_at         TIMESTAMPTZ,
    broken_at       TIMESTAMPTZ,
    evidence_url    TEXT CHECK (evidence_url IS NULL OR char_length(evidence_url) <= 2048),
    created_by      UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    schema_version  SMALLINT NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_promises_tenant_status
    ON postmortem_promises (tenant_id, status, due_date);

CREATE INDEX IF NOT EXISTS idx_promises_owner_status
    ON postmortem_promises (owner_id, status);

CREATE INDEX IF NOT EXISTS idx_promises_incident
    ON postmortem_promises (incident_id);

CREATE TABLE IF NOT EXISTS promise_violations (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    promise_id               UUID NOT NULL REFERENCES postmortem_promises(id) ON DELETE CASCADE,
    recurrence_incident_id   UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    cost_minutes             REAL NOT NULL DEFAULT 0 CHECK (cost_minutes >= 0),
    detected_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    schema_version           SMALLINT NOT NULL DEFAULT 1,
    UNIQUE (promise_id, recurrence_incident_id)
);

CREATE INDEX IF NOT EXISTS idx_violations_tenant_recent
    ON promise_violations (tenant_id, detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_violations_incident
    ON promise_violations (recurrence_incident_id);
