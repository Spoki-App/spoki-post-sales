-- Persistenza dei risultati di analisi delle call (attivazione + training).
-- Una riga per (engagement_hubspot_id), upsert ad ogni ri-analisi.
CREATE TABLE IF NOT EXISTS call_analyses (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  engagement_hubspot_id TEXT UNIQUE NOT NULL,
  call_type             TEXT NOT NULL CHECK (call_type IN ('activation','training')),
  owner_id              TEXT,
  client_id             UUID REFERENCES clients(id) ON DELETE SET NULL,
  occurred_at           TIMESTAMPTZ NOT NULL,
  fathom_share_url      TEXT,
  checkpoints           JSONB NOT NULL,
  evidences             JSONB,
  passed_count          INTEGER NOT NULL,
  total_checkpoints     INTEGER NOT NULL,
  model                 TEXT NOT NULL,
  prompt_version        TEXT NOT NULL,
  analyzed_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS call_analyses_owner_idx
  ON call_analyses(owner_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS call_analyses_type_idx
  ON call_analyses(call_type, occurred_at DESC);

CREATE INDEX IF NOT EXISTS call_analyses_client_idx
  ON call_analyses(client_id);

CREATE OR REPLACE TRIGGER call_analyses_updated_at
  BEFORE UPDATE ON call_analyses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
