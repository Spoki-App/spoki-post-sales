-- Post-Sales CS Dashboard – Initial Schema
-- Run this migration once to set up the database.

-- ─── Extensions ──────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ─── Clients (synced from HubSpot Companies) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS clients (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hubspot_id          TEXT UNIQUE NOT NULL,
  name                TEXT NOT NULL,
  domain              TEXT,
  industry            TEXT,
  city                TEXT,
  country             TEXT,
  phone               TEXT,
  lifecycle_stage     TEXT,
  plan                TEXT,
  mrr                 NUMERIC(12, 2),
  contract_value      NUMERIC(12, 2),
  contract_start_date DATE,
  renewal_date        DATE,
  onboarding_status   TEXT DEFAULT 'not_started',
  cs_owner_id         TEXT,
  churn_risk          TEXT,
  raw_properties      JSONB,
  last_synced_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS clients_hubspot_id_idx ON clients (hubspot_id);
CREATE INDEX IF NOT EXISTS clients_renewal_date_idx ON clients (renewal_date);
CREATE INDEX IF NOT EXISTS clients_cs_owner_idx ON clients (cs_owner_id);

-- ─── Contacts (synced from HubSpot Contacts, linked to clients) ──────────────
CREATE TABLE IF NOT EXISTS contacts (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hubspot_id       TEXT UNIQUE NOT NULL,
  client_id        UUID REFERENCES clients(id) ON DELETE SET NULL,
  email            TEXT,
  first_name       TEXT,
  last_name        TEXT,
  phone            TEXT,
  job_title        TEXT,
  lifecycle_stage  TEXT,
  owner_id         TEXT,
  last_activity_at TIMESTAMPTZ,
  raw_properties   JSONB,
  last_synced_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS contacts_client_id_idx ON contacts (client_id);
CREATE INDEX IF NOT EXISTS contacts_hubspot_id_idx ON contacts (hubspot_id);

-- ─── Tickets (synced from HubSpot Tickets) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS tickets (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hubspot_id       TEXT UNIQUE NOT NULL,
  client_id        UUID REFERENCES clients(id) ON DELETE SET NULL,
  subject          TEXT,
  content          TEXT,
  status           TEXT,
  priority         TEXT,
  pipeline         TEXT,
  owner_id         TEXT,
  opened_at        TIMESTAMPTZ,
  closed_at        TIMESTAMPTZ,
  last_modified_at TIMESTAMPTZ,
  raw_properties   JSONB,
  last_synced_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tickets_client_id_idx ON tickets (client_id);
CREATE INDEX IF NOT EXISTS tickets_status_idx ON tickets (status);
CREATE INDEX IF NOT EXISTS tickets_priority_idx ON tickets (priority);

-- ─── Engagements (synced from HubSpot Engagements: calls, emails, meetings) ──
CREATE TABLE IF NOT EXISTS engagements (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hubspot_id     TEXT UNIQUE NOT NULL,
  client_id      UUID REFERENCES clients(id) ON DELETE SET NULL,
  contact_id     UUID REFERENCES contacts(id) ON DELETE SET NULL,
  type           TEXT NOT NULL,   -- CALL, EMAIL, MEETING, NOTE, TASK
  occurred_at    TIMESTAMPTZ NOT NULL,
  owner_id       TEXT,
  title          TEXT,
  raw_properties JSONB,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS engagements_client_id_idx ON engagements (client_id);
CREATE INDEX IF NOT EXISTS engagements_occurred_at_idx ON engagements (occurred_at DESC);

-- ─── Health Scores (calculated after each sync) ───────────────────────────────
CREATE TABLE IF NOT EXISTS health_scores (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id               UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  score                   SMALLINT NOT NULL CHECK (score >= 0 AND score <= 100),
  status                  TEXT NOT NULL CHECK (status IN ('green', 'yellow', 'red')),
  score_last_contact      SMALLINT NOT NULL DEFAULT 0,
  score_tickets           SMALLINT NOT NULL DEFAULT 0,
  score_onboarding        SMALLINT NOT NULL DEFAULT 0,
  score_renewal           SMALLINT NOT NULL DEFAULT 0,
  days_since_last_contact INTEGER,
  open_tickets_count      INTEGER DEFAULT 0,
  open_high_tickets_count INTEGER DEFAULT 0,
  onboarding_pct          NUMERIC(5, 2) DEFAULT 0,
  days_to_renewal         INTEGER,
  calculated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS health_scores_client_id_idx ON health_scores (client_id);
CREATE INDEX IF NOT EXISTS health_scores_calculated_at_idx ON health_scores (calculated_at DESC);

-- Latest health score per client (for fast queries)
CREATE UNIQUE INDEX IF NOT EXISTS health_scores_client_latest_idx
  ON health_scores (client_id, calculated_at DESC);

-- ─── Tasks (local CS team tasks) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tasks (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id    UUID REFERENCES clients(id) ON DELETE SET NULL,
  title        TEXT NOT NULL,
  description  TEXT,
  status       TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'done', 'cancelled')),
  priority     TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  due_date     DATE,
  assigned_to  TEXT,   -- user email
  created_by   TEXT,
  completed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tasks_client_id_idx ON tasks (client_id);
CREATE INDEX IF NOT EXISTS tasks_assigned_to_idx ON tasks (assigned_to);
CREATE INDEX IF NOT EXISTS tasks_status_idx ON tasks (status);
CREATE INDEX IF NOT EXISTS tasks_due_date_idx ON tasks (due_date);

-- ─── Onboarding Templates ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS onboarding_templates (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  description TEXT,
  plan_filter TEXT,   -- apply only to clients on this plan; NULL = all
  steps       JSONB NOT NULL DEFAULT '[]',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Onboarding Progress (per client) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS onboarding_progress (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id   UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  template_id UUID REFERENCES onboarding_templates(id) ON DELETE SET NULL,
  steps       JSONB NOT NULL DEFAULT '[]',
  pct_complete NUMERIC(5, 2) NOT NULL DEFAULT 0,
  started_at  TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS onboarding_progress_client_idx ON onboarding_progress (client_id);

-- ─── Alert Rules ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alert_rules (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          TEXT NOT NULL,
  description   TEXT,
  type          TEXT NOT NULL,
  -- Supported types: no_contact, renewal_approaching, high_ticket_opened,
  --                  health_score_drop, onboarding_stalled
  threshold     INTEGER,    -- e.g. days for no_contact, days_before for renewal_approaching
  severity      TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  enabled       BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Alerts (triggered) ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alerts (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id    UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  rule_id      UUID REFERENCES alert_rules(id) ON DELETE SET NULL,
  type         TEXT NOT NULL,
  severity     TEXT NOT NULL DEFAULT 'medium',
  message      TEXT NOT NULL,
  metadata     JSONB,
  read_by      TEXT[],
  resolved     BOOLEAN NOT NULL DEFAULT false,
  resolved_at  TIMESTAMPTZ,
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS alerts_client_id_idx ON alerts (client_id);
CREATE INDEX IF NOT EXISTS alerts_resolved_idx ON alerts (resolved);
CREATE INDEX IF NOT EXISTS alerts_triggered_at_idx ON alerts (triggered_at DESC);

-- ─── Seed default alert rules ────────────────────────────────────────────────
INSERT INTO alert_rules (name, description, type, threshold, severity) VALUES
  ('Nessun contatto da 30 giorni', 'Nessuna attività registrata in HubSpot negli ultimi 30 giorni', 'no_contact', 30, 'medium'),
  ('Nessun contatto da 60 giorni', 'Nessuna attività registrata in HubSpot negli ultimi 60 giorni', 'no_contact', 60, 'high'),
  ('Rinnovo entro 30 giorni', 'Il contratto del cliente scade entro 30 giorni', 'renewal_approaching', 30, 'high'),
  ('Rinnovo entro 14 giorni', 'Il contratto del cliente scade entro 14 giorni', 'renewal_approaching', 14, 'critical'),
  ('Ticket alta priorità aperto', 'È stato aperto un ticket con priorità HIGH', 'high_ticket_opened', NULL, 'high'),
  ('Health score critico', 'Lo score di salute del cliente è sceso sotto 40', 'health_score_drop', 40, 'high'),
  ('Onboarding in stallo', 'Onboarding avviato ma non completato dopo 30 giorni', 'onboarding_stalled', 30, 'medium')
ON CONFLICT DO NOTHING;

-- ─── Updated_at trigger ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER clients_updated_at BEFORE UPDATE ON clients FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE OR REPLACE TRIGGER contacts_updated_at BEFORE UPDATE ON contacts FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE OR REPLACE TRIGGER tasks_updated_at BEFORE UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE OR REPLACE TRIGGER onboarding_templates_updated_at BEFORE UPDATE ON onboarding_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE OR REPLACE TRIGGER onboarding_progress_updated_at BEFORE UPDATE ON onboarding_progress FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE OR REPLACE TRIGGER alert_rules_updated_at BEFORE UPDATE ON alert_rules FOR EACH ROW EXECUTE FUNCTION update_updated_at();
