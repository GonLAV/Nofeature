-- Chaos Rehearsal: AI-powered incident war game simulator
-- Stores drill sessions and the turn-by-turn conversation log

CREATE TABLE IF NOT EXISTS rehearsal_sessions (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_by       UUID        NOT NULL REFERENCES users(id),
  title            TEXT        NOT NULL,
  difficulty       TEXT        NOT NULL DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard')),
  status           TEXT        NOT NULL DEFAULT 'active'  CHECK (status IN ('active', 'completed', 'abandoned')),
  scenario         JSONB       NOT NULL DEFAULT '{}',
  score            INTEGER     CHECK (score BETWEEN 0 AND 100),
  scoring_details  JSONB,
  started_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at     TIMESTAMPTZ,
  deleted_at       TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS rehearsal_messages (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID        NOT NULL REFERENCES rehearsal_sessions(id) ON DELETE CASCADE,
  role        TEXT        NOT NULL CHECK (role IN ('system', 'responder')),
  content     TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rehearsal_sessions_tenant    ON rehearsal_sessions(tenant_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_rehearsal_sessions_user      ON rehearsal_sessions(created_by);
CREATE INDEX IF NOT EXISTS idx_rehearsal_messages_session   ON rehearsal_messages(session_id, created_at);
