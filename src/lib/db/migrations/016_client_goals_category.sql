-- Categorize each client goal so the UI can group/filter business outcomes
-- (automation, marketing, sales, customer_service, integration, analytics, other).
ALTER TABLE client_goals
  ADD COLUMN IF NOT EXISTS category TEXT
    CHECK (category IN ('automation','marketing','sales','customer_service','integration','analytics','other'));

CREATE INDEX IF NOT EXISTS goals_category_idx ON client_goals(client_id, category);
