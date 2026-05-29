CREATE TABLE IF NOT EXISTS cs_success_pipeline (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id           UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  owner_hubspot_id    TEXT NOT NULL,
  stage               TEXT NOT NULL,
  stage_changed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT cs_success_pipeline_client_unique UNIQUE (client_id),
  CONSTRAINT cs_success_pipeline_stage_check CHECK (stage IN (
    'welcome_call', 'follow_up_1', 'follow_up_2',
    'kpi_1', 'kpi_2', 'kpi_3', 'kpi_4', 'kpi_5', 'completed'
  ))
);

CREATE INDEX IF NOT EXISTS cs_success_pipeline_owner_idx ON cs_success_pipeline (owner_hubspot_id);
CREATE INDEX IF NOT EXISTS cs_success_pipeline_stage_idx ON cs_success_pipeline (stage);
