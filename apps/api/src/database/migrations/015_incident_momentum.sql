-- ─────────────────────────────────────────────────────────────
-- Migration: 015_incident_momentum
-- Incident Momentum Index — periodic snapshots of a 0-100 score
-- describing whether a war room is making progress or stalling.
--
-- Snapshots are written by the momentum service whenever the
-- score is recomputed (manual recompute, after timeline events,
-- or on a future scheduled tick). They power both the live gauge
-- in the UI and the historical sparkline shown in postmortems.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS incident_momentum_snapshots (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  incident_id  UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  -- 0-100 composite score (higher = more momentum).
  score        SMALLINT NOT NULL CHECK (score BETWEEN 0 AND 100),
  -- Bucketed category derived from the score for fast filtering.
  category     TEXT NOT NULL
               CHECK (category IN ('charging','steady','stalling','frozen','resolved')),
  -- Per-signal numeric breakdown + computed metadata. Schema is
  -- intentionally JSONB so it can evolve without further migrations.
  signals      JSONB NOT NULL DEFAULT '{}',
  captured_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_momentum_incident
  ON incident_momentum_snapshots (incident_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_momentum_tenant
  ON incident_momentum_snapshots (tenant_id, captured_at DESC);
