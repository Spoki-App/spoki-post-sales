-- Template versionati di prompt per la generazione di domande pre-call
-- (tool "Domande call" usato dal CSM prima di un touchpoint con un cliente).
-- Tabella separata da prompt_templates: semantica diversa (PRE-call vs analisi POST-call con checkpoint).
-- Niente CHECK su touchpoint_type per permettere all'admin di aggiungere nuovi tipi via UI.
CREATE TABLE IF NOT EXISTS touchpoint_question_templates (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  touchpoint_type TEXT NOT NULL,
  version         TEXT NOT NULL,
  label           TEXT NOT NULL,
  description     TEXT,
  system_prompt   TEXT NOT NULL,
  is_active       BOOLEAN NOT NULL DEFAULT FALSE,
  notes           TEXT,
  created_by      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (touchpoint_type, version)
);

-- Garantisce un solo template attivo per touchpoint_type.
CREATE UNIQUE INDEX IF NOT EXISTS touchpoint_question_templates_active_unique
  ON touchpoint_question_templates(touchpoint_type) WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS touchpoint_question_templates_type_idx
  ON touchpoint_question_templates(touchpoint_type, created_at DESC);

CREATE OR REPLACE TRIGGER touchpoint_question_templates_updated_at
  BEFORE UPDATE ON touchpoint_question_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
