-- Many-to-many bridge between clients and contacts.
-- Models multiple HubSpot company↔contact associations (e.g. a contact who is "Spoki Connection"
-- on one company and primary on another). `contacts.client_id` keeps the contact's *own* primary
-- company for backward compatibility with the rest of the schema.
CREATE TABLE IF NOT EXISTS client_contacts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id       UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  contact_id      UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  is_primary      BOOLEAN NOT NULL DEFAULT FALSE,
  label           TEXT,
  -- 'hubspot_typeid_2' (native primary association) | 'hubspot_property' (company primary contact id property) | NULL
  primary_source  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, contact_id)
);

CREATE INDEX IF NOT EXISTS client_contacts_client_id_idx ON client_contacts (client_id);
CREATE INDEX IF NOT EXISTS client_contacts_contact_id_idx ON client_contacts (contact_id);
-- One primary per client (partial unique).
CREATE UNIQUE INDEX IF NOT EXISTS client_contacts_one_primary_per_client
  ON client_contacts (client_id) WHERE is_primary = TRUE;

CREATE OR REPLACE TRIGGER client_contacts_updated_at
  BEFORE UPDATE ON client_contacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Seed from existing contacts.client_id so the portfolio still works between the migration
-- and the next HubSpot sync. The sync will reconcile is_primary/label from associations.
INSERT INTO client_contacts (client_id, contact_id, is_primary, primary_source)
SELECT
  co.client_id,
  co.id,
  COALESCE(NULLIF(BTRIM((cl.raw_properties::jsonb)->>'_hubspot_primary_contact_id'), '') = co.hubspot_id, FALSE),
  CASE
    WHEN NULLIF(BTRIM((cl.raw_properties::jsonb)->>'_hubspot_primary_contact_id'), '') = co.hubspot_id
      THEN 'hubspot_typeid_2'
    ELSE NULL
  END
FROM contacts co
JOIN clients cl ON cl.id = co.client_id
ON CONFLICT (client_id, contact_id) DO NOTHING;
