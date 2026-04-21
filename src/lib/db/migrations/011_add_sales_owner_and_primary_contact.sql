-- Sales owner on company (HubSpot owner id of the closed-won deal),
-- used to display the Sales reference for each client.
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS sales_owner_id TEXT;

CREATE INDEX IF NOT EXISTS clients_sales_owner_idx ON clients (sales_owner_id);

-- Flag for the contact marked as PRIMARY on the company-contact association
-- (HubSpot association category HUBSPOT_DEFINED, typeId 2). Used to surface
-- the primary contact's phone in the portfolio table.
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS contacts_primary_idx ON contacts (client_id) WHERE is_primary;
