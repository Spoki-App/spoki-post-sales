-- NAR Dashboard module: dataset uploads, raw rows, snapshots, exclusions, operator overrides.
-- Sostituisce Firestore chunked storage e localStorage del vecchio nar-dashboard SPA.

-- ─── Uploads ─────────────────────────────────────────────────────────────────
-- Un upload = uno snapshot settimanale del CSV NAR. is_current = TRUE su esattamente un upload.
CREATE TABLE IF NOT EXISTS nar_uploads (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  uploaded_by_email  TEXT,
  uploaded_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source             TEXT NOT NULL DEFAULT 'csv' CHECK (source IN ('csv','api')),
  row_count          INTEGER NOT NULL DEFAULT 0,
  file_name          TEXT,
  notes              TEXT,
  is_current         BOOLEAN NOT NULL DEFAULT FALSE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Garantisce un solo upload corrente alla volta.
CREATE UNIQUE INDEX IF NOT EXISTS nar_uploads_one_current_idx
  ON nar_uploads (is_current) WHERE is_current = TRUE;

CREATE INDEX IF NOT EXISTS nar_uploads_uploaded_at_idx
  ON nar_uploads (uploaded_at DESC);

-- ─── Rows ────────────────────────────────────────────────────────────────────
-- Una riga = una osservazione settimana/mese per account. Cardinalità tipica:
-- (numero account attivi) × (settimane × mesi monitorati). Per portali fino a ~50k rows.
CREATE TABLE IF NOT EXISTS nar_rows (
  id                         BIGSERIAL PRIMARY KEY,
  upload_id                  UUID NOT NULL REFERENCES nar_uploads(id) ON DELETE CASCADE,
  account_id                 BIGINT NOT NULL,
  account_name               TEXT,
  plan_slug                  TEXT,
  partner_id                 TEXT,
  partner_type               TEXT,
  country_code               TEXT,
  week_count                 INTEGER,
  month_count                INTEGER,
  conversation_tier          NUMERIC,
  week_conversation_count    NUMERIC,
  month_conversation_count   NUMERIC,
  company_owner              TEXT,
  raw                        JSONB
);

CREATE INDEX IF NOT EXISTS nar_rows_upload_account_idx
  ON nar_rows (upload_id, account_id);

CREATE INDEX IF NOT EXISTS nar_rows_upload_week_idx
  ON nar_rows (upload_id, week_count);

CREATE INDEX IF NOT EXISTS nar_rows_upload_month_idx
  ON nar_rows (upload_id, month_count);

-- ─── Snapshots ───────────────────────────────────────────────────────────────
-- Sostituisce localStorage 'nar_history'. Condivisi tra tutti gli utenti del team.
CREATE TABLE IF NOT EXISTS nar_snapshots (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  label              TEXT NOT NULL,
  created_by_email   TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  filter_type        TEXT NOT NULL DEFAULT 'none' CHECK (filter_type IN ('none','month','week')),
  month_filter       INTEGER[] NOT NULL DEFAULT '{}',
  week_filter        INTEGER[] NOT NULL DEFAULT '{}',
  exclude_week_zero  BOOLEAN NOT NULL DEFAULT TRUE,
  upload_id          UUID REFERENCES nar_uploads(id) ON DELETE SET NULL,
  stats              JSONB NOT NULL DEFAULT '{}'::jsonb,
  buckets            JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS nar_snapshots_created_at_idx
  ON nar_snapshots (created_at DESC);

-- ─── Excluded accounts ───────────────────────────────────────────────────────
-- Unifica withdrawnAccounts + directExclusions del vecchio dashboard, con discriminator `reason`.
CREATE TABLE IF NOT EXISTS nar_excluded_accounts (
  account_id         BIGINT NOT NULL,
  reason             TEXT NOT NULL CHECK (reason IN ('withdrawn','direct_exclusion')),
  account_name       TEXT,
  excluded_by_email  TEXT,
  excluded_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes              TEXT,
  PRIMARY KEY (account_id, reason)
);

-- ─── Operator overrides ──────────────────────────────────────────────────────
-- Override puntuale del mapping account_id → operator. Ha precedenza sull'owner derivato
-- da clients.raw_properties (sync HubSpot). Source 'csv' = caricato da CSV operatori,
-- 'manual' = modificato in UI, 'hubspot' = riservato a backfill futuri.
CREATE TABLE IF NOT EXISTS nar_operator_overrides (
  account_id         BIGINT PRIMARY KEY,
  operator_name      TEXT NOT NULL,
  source             TEXT NOT NULL DEFAULT 'csv' CHECK (source IN ('csv','manual','hubspot')),
  account_name       TEXT,
  partner_type       TEXT,
  plan               TEXT,
  status             TEXT,
  updated_by_email   TEXT,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS nar_operator_overrides_operator_idx
  ON nar_operator_overrides (operator_name);
