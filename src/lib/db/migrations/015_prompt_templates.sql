-- Template versionati di prompt + checkpoint per l'analisi delle call.
-- Il seed iniziale (presa dei default da code) avviene a runtime in prompt-registry.ts
-- alla prima lettura quando la tabella e' vuota per quel call_type.
CREATE TABLE IF NOT EXISTS prompt_templates (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  call_type       TEXT NOT NULL CHECK (call_type IN ('activation','training')),
  version         TEXT NOT NULL,
  system_prompt   TEXT NOT NULL,
  checkpoints     JSONB NOT NULL,
  is_active       BOOLEAN NOT NULL DEFAULT FALSE,
  notes           TEXT,
  created_by      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (call_type, version)
);

-- Garantisce un solo template attivo per call_type.
CREATE UNIQUE INDEX IF NOT EXISTS prompt_templates_active_unique
  ON prompt_templates(call_type) WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS prompt_templates_call_type_idx
  ON prompt_templates(call_type, created_at DESC);

CREATE OR REPLACE TRIGGER prompt_templates_updated_at
  BEFORE UPDATE ON prompt_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
