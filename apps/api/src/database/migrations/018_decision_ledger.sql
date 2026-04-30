-- ───────────────────────────────────────────────────────────────
-- Decision Ledger
-- ───────────────────────────────────────────────────────────────
-- Every meaningful move the commander or a responder makes during
-- an incident is logged as a "bet": an action paired with an
-- explicit expected outcome and a deadline. When the deadline
-- elapses, the system asks "did it work?" and the answer is stored
-- alongside the original prediction. Over time this gives every
-- responder a calibration score (accuracy / Brier-style) that
-- surfaces who has high signal under pressure.
-- ───────────────────────────────────────────────────────────────

CREATE TABLE incident_decisions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  incident_id        UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  author_id          UUID NOT NULL REFERENCES users(id),
  action             TEXT NOT NULL,
  expected_outcome   TEXT NOT NULL,
  expected_metric    TEXT,
  expected_direction TEXT CHECK (expected_direction IN ('decrease','increase','restore','none')),
  confidence         SMALLINT NOT NULL DEFAULT 70 CHECK (confidence BETWEEN 1 AND 100),
  evaluate_at        TIMESTAMPTZ NOT NULL,
  status             TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','worked','failed','inconclusive','reverted')),
  outcome_note       TEXT,
  evaluated_at       TIMESTAMPTZ,
  evaluated_by       UUID REFERENCES users(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_decisions_incident ON incident_decisions (incident_id, created_at DESC);
CREATE INDEX idx_decisions_tenant_status ON incident_decisions (tenant_id, status);
CREATE INDEX idx_decisions_evaluate_at ON incident_decisions (evaluate_at) WHERE status = 'pending';
CREATE INDEX idx_decisions_author ON incident_decisions (tenant_id, author_id, status);

CREATE TRIGGER trg_incident_decisions_updated
  BEFORE UPDATE ON incident_decisions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
