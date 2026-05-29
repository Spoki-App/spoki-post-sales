-- Diagnostica delle chiamate che non sono state abbinate a Fathom durante un'analisi.
-- Il record viene upsertato ad ogni tentativo. Si svuota quando il match riesce
-- (lo facciamo lato applicativo eliminando la riga).
CREATE TABLE IF NOT EXISTS call_match_failures (
  engagement_hubspot_id  TEXT PRIMARY KEY,
  call_type              TEXT NOT NULL CHECK (call_type IN ('activation','training')),
  reason_code            TEXT NOT NULL,
  reason_message         TEXT,
  attempts               INTEGER NOT NULL DEFAULT 1,
  last_attempt_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS call_match_failures_type_idx
  ON call_match_failures(call_type, last_attempt_at DESC);
