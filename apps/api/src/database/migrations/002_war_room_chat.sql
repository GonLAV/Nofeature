-- ─────────────────────────────────────────────────────────────
-- Migration: 002_war_room_chat
-- Live war-room chat for real-time incident collaboration
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS incident_messages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id  UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id),
  content      TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 4000),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_incident
  ON incident_messages(incident_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_messages_tenant
  ON incident_messages(tenant_id, created_at DESC);
