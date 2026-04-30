-- ─────────────────────────────────────────────────────────────
-- Migration: 017_incident_hypotheses
-- Hypothesis Tracker — structured "what do we think is wrong?"
-- objects with voting and evidence linking.
--
-- A hypothesis is one candidate explanation posted by a responder
-- during an incident. The room votes (+1/-1), attaches evidence
-- (timeline entries, comments, runbooks, free-text), and on
-- resolution marks at most one hypothesis as the confirmed cause.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS incident_hypotheses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  incident_id   UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  author_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  title         TEXT NOT NULL,
  description   TEXT,
  status        TEXT NOT NULL DEFAULT 'investigating'
                CHECK (status IN ('investigating','confirmed','refuted','superseded')),
  resolved_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hypotheses_incident ON incident_hypotheses (incident_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hypotheses_tenant_status ON incident_hypotheses (tenant_id, status);

CREATE TRIGGER trg_hypotheses_updated
  BEFORE UPDATE ON incident_hypotheses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- One vote per (hypothesis, user). +1 = support, -1 = doubt.
CREATE TABLE IF NOT EXISTS hypothesis_votes (
  hypothesis_id UUID NOT NULL REFERENCES incident_hypotheses(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vote          SMALLINT NOT NULL CHECK (vote IN (-1, 1)),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (hypothesis_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_hypothesis_votes_user ON hypothesis_votes (user_id);

-- Evidence — supports, contradicts, or annotates a hypothesis.
CREATE TABLE IF NOT EXISTS hypothesis_evidence (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hypothesis_id UUID NOT NULL REFERENCES incident_hypotheses(id) ON DELETE CASCADE,
  user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  -- 'supports' = makes the hypothesis more likely; 'contradicts' = less likely.
  stance        TEXT NOT NULL CHECK (stance IN ('supports','contradicts','context')),
  -- Reference shape: { kind: 'timeline'|'comment'|'runbook'|'url'|'note', ref?: uuid, url?: text, note?: text }
  reference     JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_evidence_hypothesis ON hypothesis_evidence (hypothesis_id, created_at DESC);
