-- HubSpot company id on engagements: used to match rows when client_id is null
-- but the engagement is still tied to the company (sync maps company → client when possible).
ALTER TABLE engagements ADD COLUMN IF NOT EXISTS company_hubspot_id TEXT;
CREATE INDEX IF NOT EXISTS engagements_company_hubspot_id_idx ON engagements (company_hubspot_id);
