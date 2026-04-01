-- Add separate owner fields for onboarding and customer success
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS onboarding_owner_id TEXT,
  ADD COLUMN IF NOT EXISTS success_owner_id TEXT;

CREATE INDEX IF NOT EXISTS clients_onboarding_owner_idx ON clients (onboarding_owner_id);
CREATE INDEX IF NOT EXISTS clients_success_owner_idx ON clients (success_owner_id);
