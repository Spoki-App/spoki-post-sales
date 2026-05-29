-- Prevent duplicate goals per client when re-extracting from HubSpot.
-- Titles are capped at 200 chars in application code, so a direct btree index is fine.
CREATE UNIQUE INDEX IF NOT EXISTS client_goals_client_title_uniq
  ON client_goals (client_id, title);
