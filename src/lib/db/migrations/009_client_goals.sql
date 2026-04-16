-- Client Goals: objectives extracted from HubSpot engagements (playbook notes,
-- call transcriptions, emails) via AI, or created manually by operators.
CREATE TABLE IF NOT EXISTS client_goals (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id            UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  title                TEXT NOT NULL,
  description          TEXT,
  status               TEXT NOT NULL DEFAULT 'active'
                         CHECK (status IN ('active', 'achieved', 'abandoned')),
  source               TEXT NOT NULL DEFAULT 'manual'
                         CHECK (source IN ('manual', 'ai_extracted', 'playbook')),
  source_engagement_id UUID REFERENCES engagements(id) ON DELETE SET NULL,
  mentioned_at         DATE,
  due_date             DATE,
  created_by           TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS goals_client_id_idx ON client_goals(client_id);

CREATE OR REPLACE TRIGGER client_goals_updated_at
  BEFORE UPDATE ON client_goals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
