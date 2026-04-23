-- Deals synced from HubSpot (Sales Pipeline + Upselling Pipeline | Customer).
CREATE TABLE IF NOT EXISTS deals (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hubspot_id       TEXT UNIQUE NOT NULL,
  client_id        UUID REFERENCES clients(id) ON DELETE SET NULL,
  pipeline_id      TEXT NOT NULL,
  stage_id         TEXT NOT NULL,
  deal_name        TEXT,
  amount           NUMERIC(12, 2),
  close_date       DATE,
  owner_id         TEXT,
  stage_entered_at TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS deals_client_id_idx ON deals(client_id);
CREATE INDEX IF NOT EXISTS deals_pipeline_idx ON deals(pipeline_id);

CREATE OR REPLACE TRIGGER deals_updated_at
  BEFORE UPDATE ON deals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
