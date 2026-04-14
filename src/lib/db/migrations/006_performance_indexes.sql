-- Performance indexes for clients list query (lateral joins)

CREATE INDEX IF NOT EXISTS engagements_client_type_occurred_idx
  ON engagements (client_id, occurred_at DESC)
  WHERE type IN ('CALL', 'EMAIL', 'MEETING', 'INCOMING_EMAIL');

CREATE INDEX IF NOT EXISTS engagements_contact_type_occurred_idx
  ON engagements (contact_id, occurred_at DESC)
  WHERE type IN ('CALL', 'EMAIL', 'MEETING', 'INCOMING_EMAIL');

CREATE INDEX IF NOT EXISTS tickets_client_pipeline_opened_idx
  ON tickets (client_id, pipeline, opened_at DESC);

CREATE INDEX IF NOT EXISTS tickets_client_support_idx
  ON tickets (client_id)
  WHERE closed_at IS NULL AND pipeline = '1249920186';
