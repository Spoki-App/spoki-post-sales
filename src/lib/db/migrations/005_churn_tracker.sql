-- Churn Tracker tables

CREATE TABLE IF NOT EXISTS churn_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id INTEGER NOT NULL,
  account_name TEXT,
  plan_slug TEXT,
  conversation_limit INTEGER,
  mrr_lost NUMERIC(12,2) DEFAULT 0,
  subscription_end_date DATE,
  payment_type TEXT,
  days_since_expiry INTEGER DEFAULT 0,
  hs_id TEXT,
  is_partner BOOLEAN DEFAULT FALSE,
  first_payment_date DATE,
  first_plan_slug TEXT,
  primary_contact TEXT,
  status TEXT NOT NULL DEFAULT 'nuovo',
  churn_reason TEXT,
  contact_outcome TEXT,
  assigned_to JSONB,
  status_changed_at TIMESTAMPTZ,
  first_detected_at TIMESTAMPTZ DEFAULT NOW(),
  last_synced_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (account_id, subscription_end_date)
);

CREATE INDEX IF NOT EXISTS idx_churn_records_status ON churn_records(status);
CREATE INDEX IF NOT EXISTS idx_churn_records_account ON churn_records(account_id);

CREATE TABLE IF NOT EXISTS churn_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  churn_record_id UUID NOT NULL REFERENCES churn_records(id) ON DELETE CASCADE,
  account_id INTEGER NOT NULL,
  text TEXT NOT NULL,
  author TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_churn_notes_record ON churn_notes(churn_record_id);

DROP TRIGGER IF EXISTS update_churn_records_updated_at ON churn_records;

CREATE TRIGGER update_churn_records_updated_at
  BEFORE UPDATE ON churn_records
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
