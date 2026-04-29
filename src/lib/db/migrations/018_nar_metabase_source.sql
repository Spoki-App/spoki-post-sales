-- Estende nar_uploads.source per accettare 'metabase' come sorgente automatica.
-- La colonna source esiste gia' (017) con CHECK ('csv','api'); aggiungiamo 'metabase'
-- senza toccare i record esistenti (default 'csv' rimane).

ALTER TABLE nar_uploads
  DROP CONSTRAINT IF EXISTS nar_uploads_source_check;

ALTER TABLE nar_uploads
  ADD CONSTRAINT nar_uploads_source_check
  CHECK (source IN ('csv', 'api', 'metabase'));

-- Index parziale per recuperare velocemente l'ultimo refresh automatico (UI: badge "ultimo aggiornamento Metabase").
CREATE INDEX IF NOT EXISTS nar_uploads_metabase_uploaded_at_idx
  ON nar_uploads (uploaded_at DESC)
  WHERE source = 'metabase';
