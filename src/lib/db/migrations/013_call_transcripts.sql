-- Metadati dei transcript Fathom archiviati su Supabase Storage.
-- Il payload (JSON gzippato) vive nel bucket; qui teniamo solo i puntatori
-- + qualche metadato utile per evitare round-trip a Supabase.
CREATE TABLE IF NOT EXISTS call_transcripts (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  engagement_hubspot_id  TEXT UNIQUE NOT NULL,
  fathom_recording_id    TEXT,
  call_type              TEXT CHECK (call_type IN ('activation','training')),
  storage_bucket         TEXT NOT NULL,
  storage_path           TEXT NOT NULL,
  bytes                  INTEGER,
  duration_seconds       INTEGER,
  participants_count     INTEGER,
  title                  TEXT,
  share_url              TEXT,
  source                 TEXT NOT NULL DEFAULT 'fathom',
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS call_transcripts_recording_idx
  ON call_transcripts(fathom_recording_id);

CREATE INDEX IF NOT EXISTS call_transcripts_type_idx
  ON call_transcripts(call_type, created_at DESC);

CREATE OR REPLACE TRIGGER call_transcripts_updated_at
  BEFORE UPDATE ON call_transcripts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
