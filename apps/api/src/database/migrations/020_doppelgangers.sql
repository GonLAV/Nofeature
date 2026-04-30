-- Cycle 17: Incident Doppelgangers
-- Adds a Postgres FTS GIN index over incident title + description so we can
-- ask "has this happened before?" in O(log n) instead of scanning history.
--
-- We use the 'simple' configuration to avoid stemming surprises across the
-- mix of identifiers, hostnames, and code references that show up in
-- incident titles/descriptions. This keeps matches predictable for SREs.

CREATE INDEX IF NOT EXISTS idx_incidents_search_fts
    ON incidents USING GIN (
        to_tsvector(
            'simple',
            coalesce(title, '') || ' ' || coalesce(description, '')
        )
    )
    WHERE deleted_at IS NULL;

-- Tags are a useful tie-breaker for ranking — keep them lookup-friendly too.
CREATE INDEX IF NOT EXISTS idx_incidents_affected_systems_gin
    ON incidents USING GIN (affected_systems)
    WHERE deleted_at IS NULL;
