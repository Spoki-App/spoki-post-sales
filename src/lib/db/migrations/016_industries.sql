ALTER TABLE clients ADD COLUMN IF NOT EXISTS industry_spoki TEXT;
CREATE INDEX IF NOT EXISTS clients_industry_spoki_idx ON clients (industry_spoki);

CREATE TABLE IF NOT EXISTS industry_spoki_dictionary (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hubspot_value         TEXT NOT NULL UNIQUE,
  slug                  TEXT NOT NULL UNIQUE,
  label                 TEXT NOT NULL,
  sort_order            INT NOT NULL DEFAULT 0,
  website_param_value   TEXT,
  is_active             BOOLEAN NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS industry_spoki_dictionary_sort_idx ON industry_spoki_dictionary (sort_order, label);

CREATE TABLE IF NOT EXISTS marketing_content_items (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  content_type          TEXT NOT NULL CHECK (content_type IN ('use_case', 'case_study')),
  source_url            TEXT NOT NULL UNIQUE,
  title                 TEXT NOT NULL,
  summary               TEXT,
  industry_spoki_match  TEXT,
  metadata              JSONB NOT NULL DEFAULT '{}',
  content_hash          TEXT,
  fetched_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS marketing_content_items_industry_idx ON marketing_content_items (industry_spoki_match);
CREATE INDEX IF NOT EXISTS marketing_content_items_type_idx ON marketing_content_items (content_type);

CREATE TABLE IF NOT EXISTS client_usage_snapshots (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id             UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  snapshot_at           DATE NOT NULL,
  conversations_3m      INT,
  messages_total_3m     INT,
  automations_active    INT,
  integrations_enabled  INT,
  usage_score           NUMERIC(8, 2),
  raw                   JSONB NOT NULL DEFAULT '{}',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, snapshot_at)
);

CREATE INDEX IF NOT EXISTS client_usage_snapshots_client_idx ON client_usage_snapshots (client_id, snapshot_at DESC);

CREATE TABLE IF NOT EXISTS qbr_industry_drafts (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  industry_spoki        TEXT NOT NULL,
  target_client_id      UUID REFERENCES clients(id) ON DELETE SET NULL,
  title                 TEXT,
  sections              JSONB NOT NULL DEFAULT '{}',
  created_by_email      TEXT NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS qbr_industry_drafts_industry_idx ON qbr_industry_drafts (industry_spoki);
