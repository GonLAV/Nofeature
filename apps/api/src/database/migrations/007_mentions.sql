-- ─────────────────────────────────────────────────────────────
-- Migration: 007_mentions
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS comment_mentions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  comment_id   UUID NOT NULL,
  incident_id  UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  mentioned_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mentioned_by UUID REFERENCES users(id),
  read_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mentions_user_unread ON comment_mentions (mentioned_user_id) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_mentions_incident ON comment_mentions (incident_id);
