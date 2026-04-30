-- Migration 015: Incident Genome
--
-- Stores a deterministic, low-dimensional fingerprint of every
-- incident's *response shape*. Used for nearest-neighbour search
-- when a new incident opens: "we've seen this before — here's what
-- worked then".
--
-- The vector lives as REAL[] (not pgvector) because:
--   * We don't want a hard dependency on a non-default extension.
--   * 10 dims \xd7 N incidents-per-tenant is comfortably <100k floats
--     even for very large customers \u2014 cosine similarity in app
--     code stays under 5 ms.
--
-- `components` keeps the human-readable per-feature breakdown so
-- the UI can show *why* two incidents are similar, not just that
-- they are.

CREATE TABLE IF NOT EXISTS incident_genomes (
  incident_id    UUID         PRIMARY KEY REFERENCES incidents(id) ON DELETE CASCADE,
  tenant_id      UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  vector         REAL[]       NOT NULL,
  components     JSONB        NOT NULL DEFAULT '{}'::jsonb,
  -- Vector schema version: bump when feature set changes so old
  -- genomes can be detected and recomputed lazily.
  schema_version SMALLINT     NOT NULL DEFAULT 1,
  generated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_incident_genomes_tenant
  ON incident_genomes(tenant_id, schema_version);

CREATE INDEX IF NOT EXISTS idx_incident_genomes_generated
  ON incident_genomes(tenant_id, generated_at DESC);
