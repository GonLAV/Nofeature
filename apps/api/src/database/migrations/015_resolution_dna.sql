-- ─────────────────────────────────────────────────────────────
-- Migration: 015_resolution_dna
-- Adds the feedback signal table for the Resolution DNA engine.
-- Per-step thumbs up / down recorded by responders on the live
-- incident; future similarity queries use this to reweight steps.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS incident_dna_feedback (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  incident_id  UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id),
  step_key     TEXT NOT NULL,           -- normalized action verb, e.g. "ack", "assign_commander", "runbook:db-failover"
  signal       SMALLINT NOT NULL CHECK (signal IN (-1, 1)),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (incident_id, user_id, step_key)
);

CREATE INDEX IF NOT EXISTS idx_dna_fb_tenant_step
  ON incident_dna_feedback (tenant_id, step_key);

CREATE INDEX IF NOT EXISTS idx_dna_fb_incident
  ON incident_dna_feedback (incident_id);
