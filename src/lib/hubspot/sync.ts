/**
 * HubSpot → PostgreSQL sync engine.
 * Upserts companies, contacts, tickets, and engagements.
 * Called by the /api/v1/hubspot/sync cron endpoint.
 */

import { pgQuery } from '@/lib/db/postgres';
import { getHubSpotClient, type HSCompany, type HSContact, type HSTicket, type HSEngagement } from './client';
import { getLogger } from '@/lib/logger';

const logger = getLogger('hubspot:sync');

export interface SyncResult {
  companies: number;
  contacts: number;
  tickets: number;
  engagements: number;
  errors: string[];
  durationMs: number;
}

// ─── Companies ────────────────────────────────────────────────────────────────

async function syncCompanies(companies: HSCompany[]): Promise<number> {
  if (companies.length === 0) return 0;
  let count = 0;

  for (const c of companies) {
    await pgQuery(
      `INSERT INTO clients (
        hubspot_id, name, domain, industry, city, country, phone,
        lifecycle_stage, plan, mrr, contract_value, contract_start_date,
        renewal_date, onboarding_status, cs_owner_id, churn_risk,
        raw_properties, last_synced_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,NOW(),NOW())
      ON CONFLICT (hubspot_id) DO UPDATE SET
        name               = EXCLUDED.name,
        domain             = EXCLUDED.domain,
        industry           = EXCLUDED.industry,
        city               = EXCLUDED.city,
        country            = EXCLUDED.country,
        phone              = EXCLUDED.phone,
        lifecycle_stage    = EXCLUDED.lifecycle_stage,
        plan               = EXCLUDED.plan,
        mrr                = EXCLUDED.mrr,
        contract_value     = EXCLUDED.contract_value,
        contract_start_date= EXCLUDED.contract_start_date,
        renewal_date       = EXCLUDED.renewal_date,
        onboarding_status  = COALESCE(EXCLUDED.onboarding_status, clients.onboarding_status),
        cs_owner_id        = EXCLUDED.cs_owner_id,
        churn_risk         = EXCLUDED.churn_risk,
        raw_properties     = EXCLUDED.raw_properties,
        last_synced_at     = NOW(),
        updated_at         = NOW()`,
      [
        c.id, c.name, c.domain, c.industry, c.city, c.country, c.phone,
        c.lifecycleStage, c.plan,
        c.mrr, c.contractValue,
        c.contractStartDate ? new Date(c.contractStartDate) : null,
        c.renewalDate ? new Date(c.renewalDate) : null,
        c.onboardingStatus, c.csOwnerId, c.churnRisk,
        JSON.stringify(c.rawProperties),
      ]
    );
    count++;
  }

  return count;
}

// ─── Contacts ─────────────────────────────────────────────────────────────────

async function syncContacts(contacts: HSContact[]): Promise<number> {
  if (contacts.length === 0) return 0;
  let count = 0;

  for (const c of contacts) {
    const clientRes = c.companyId
      ? await pgQuery<{ id: string }>('SELECT id FROM clients WHERE hubspot_id = $1', [c.companyId])
      : null;
    const clientId = clientRes?.rows[0]?.id ?? null;

    await pgQuery(
      `INSERT INTO contacts (
        hubspot_id, client_id, email, first_name, last_name,
        phone, job_title, lifecycle_stage, owner_id,
        last_activity_at, raw_properties, last_synced_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),NOW())
      ON CONFLICT (hubspot_id) DO UPDATE SET
        client_id        = EXCLUDED.client_id,
        email            = EXCLUDED.email,
        first_name       = EXCLUDED.first_name,
        last_name        = EXCLUDED.last_name,
        phone            = EXCLUDED.phone,
        job_title        = EXCLUDED.job_title,
        lifecycle_stage  = EXCLUDED.lifecycle_stage,
        owner_id         = EXCLUDED.owner_id,
        last_activity_at = EXCLUDED.last_activity_at,
        raw_properties   = EXCLUDED.raw_properties,
        last_synced_at   = NOW(),
        updated_at       = NOW()`,
      [
        c.id, clientId, c.email, c.firstName, c.lastName,
        c.phone, c.jobTitle, c.lifecycleStage, c.ownerId,
        c.lastActivityDate ? new Date(c.lastActivityDate) : null,
        JSON.stringify(c.rawProperties),
      ]
    );
    count++;
  }

  return count;
}

// ─── Tickets ──────────────────────────────────────────────────────────────────

async function syncTickets(tickets: HSTicket[]): Promise<number> {
  if (tickets.length === 0) return 0;
  let count = 0;

  for (const t of tickets) {
    const clientRes = t.companyId
      ? await pgQuery<{ id: string }>('SELECT id FROM clients WHERE hubspot_id = $1', [t.companyId])
      : null;
    const clientId = clientRes?.rows[0]?.id ?? null;

    await pgQuery(
      `INSERT INTO tickets (
        hubspot_id, client_id, subject, content, status,
        priority, pipeline, owner_id, opened_at, closed_at,
        last_modified_at, raw_properties, last_synced_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())
      ON CONFLICT (hubspot_id) DO UPDATE SET
        client_id        = EXCLUDED.client_id,
        subject          = EXCLUDED.subject,
        content          = EXCLUDED.content,
        status           = EXCLUDED.status,
        priority         = EXCLUDED.priority,
        pipeline         = EXCLUDED.pipeline,
        owner_id         = EXCLUDED.owner_id,
        opened_at        = EXCLUDED.opened_at,
        closed_at        = EXCLUDED.closed_at,
        last_modified_at = EXCLUDED.last_modified_at,
        raw_properties   = EXCLUDED.raw_properties,
        last_synced_at   = NOW()`,
      [
        t.id, clientId, t.subject, t.content, t.status,
        t.priority, t.pipeline, t.ownerId,
        t.openedAt ? new Date(t.openedAt) : null,
        t.closedAt ? new Date(t.closedAt) : null,
        t.lastModifiedAt ? new Date(t.lastModifiedAt) : null,
        JSON.stringify(t.rawProperties),
      ]
    );
    count++;
  }

  return count;
}

// ─── Engagements ─────────────────────────────────────────────────────────────

async function syncEngagements(engagements: HSEngagement[]): Promise<number> {
  if (engagements.length === 0) return 0;
  let count = 0;

  for (const e of engagements) {
    const clientRes = e.companyId
      ? await pgQuery<{ id: string }>('SELECT id FROM clients WHERE hubspot_id = $1', [e.companyId])
      : null;
    const clientId = clientRes?.rows[0]?.id ?? null;

    const contactRes = e.contactId
      ? await pgQuery<{ id: string }>('SELECT id FROM contacts WHERE hubspot_id = $1', [e.contactId])
      : null;
    const contactId = contactRes?.rows[0]?.id ?? null;

    await pgQuery(
      `INSERT INTO engagements (
        hubspot_id, client_id, contact_id, type, occurred_at,
        owner_id, title, raw_properties, last_synced_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
      ON CONFLICT (hubspot_id) DO UPDATE SET
        client_id      = EXCLUDED.client_id,
        contact_id     = EXCLUDED.contact_id,
        type           = EXCLUDED.type,
        occurred_at    = EXCLUDED.occurred_at,
        owner_id       = EXCLUDED.owner_id,
        title          = EXCLUDED.title,
        raw_properties = EXCLUDED.raw_properties,
        last_synced_at = NOW()`,
      [
        e.id, clientId, contactId, e.type,
        new Date(e.occurredAt),
        e.ownerId, e.title,
        JSON.stringify(e.rawProperties),
      ]
    );
    count++;
  }

  return count;
}

// ─── Main sync ────────────────────────────────────────────────────────────────

export async function runFullSync(): Promise<SyncResult> {
  const start = Date.now();
  const errors: string[] = [];
  const result: SyncResult = { companies: 0, contacts: 0, tickets: 0, engagements: 0, errors, durationMs: 0 };

  const client = getHubSpotClient();

  try {
    logger.info('Starting HubSpot full sync');

    const [companies, contacts, tickets, engagements] = await Promise.allSettled([
      client.getCompanies(),
      client.getContacts(),
      client.getTickets(),
      client.getEngagements(),
    ]);

    if (companies.status === 'fulfilled') {
      result.companies = await syncCompanies(companies.value);
      logger.info(`Synced ${result.companies} companies`);
    } else {
      errors.push(`companies: ${String(companies.reason)}`);
      logger.error('Failed to fetch companies', { error: String(companies.reason) });
    }

    if (contacts.status === 'fulfilled') {
      result.contacts = await syncContacts(contacts.value);
      logger.info(`Synced ${result.contacts} contacts`);
    } else {
      errors.push(`contacts: ${String(contacts.reason)}`);
    }

    if (tickets.status === 'fulfilled') {
      result.tickets = await syncTickets(tickets.value);
      logger.info(`Synced ${result.tickets} tickets`);
    } else {
      errors.push(`tickets: ${String(tickets.reason)}`);
    }

    if (engagements.status === 'fulfilled') {
      result.engagements = await syncEngagements(engagements.value);
      logger.info(`Synced ${result.engagements} engagements`);
    } else {
      errors.push(`engagements: ${String(engagements.reason)}`);
    }

  } catch (err) {
    errors.push(`sync: ${String(err)}`);
    logger.error('Sync failed', { error: String(err) });
  }

  result.durationMs = Date.now() - start;
  logger.info('HubSpot sync complete', {
    companies: result.companies,
    contacts: result.contacts,
    tickets: result.tickets,
    engagements: result.engagements,
    durationMs: result.durationMs,
    errors: result.errors.length,
  });

  return result;
}
