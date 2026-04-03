/**
 * HubSpot → PostgreSQL sync engine.
 * Uses batch upserts (UNNEST) for performance — one query per object type instead of N queries.
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

  // Batch upsert in chunks of 200
  const CHUNK = 200;
  let count = 0;

  for (let i = 0; i < companies.length; i += CHUNK) {
    const chunk = companies.slice(i, i + CHUNK);

    const hubspotIds = chunk.map(c => c.id);
    const names = chunk.map(c => c.name ?? '');
    const domains = chunk.map(c => c.domain);
    const industries = chunk.map(c => c.industry);
    const cities = chunk.map(c => c.city);
    const countries = chunk.map(c => c.country);
    const phones = chunk.map(c => c.phone);
    const lifecycleStages = chunk.map(c => c.lifecycleStage);
    const plans = chunk.map(c => c.plan);
    const mrrs = chunk.map(c => c.mrr);
    const contractValues = chunk.map(c => c.contractValue);
    const contractStartDates = chunk.map(c => c.contractStartDate ? new Date(c.contractStartDate) : null);
    const renewalDates = chunk.map(c => c.renewalDate ? new Date(c.renewalDate) : null);
    const onboardingStatuses = chunk.map(c => c.onboardingStatus);
    const csOwnerIds = chunk.map(c => c.companyOwnerId);
    const churnRisks = chunk.map(c => c.churnRisk);
    const rawProps = chunk.map(c => JSON.stringify(c.rawProperties));

    await pgQuery(
      `INSERT INTO clients (
        hubspot_id, name, domain, industry, city, country, phone,
        lifecycle_stage, plan, mrr, contract_value, contract_start_date,
        renewal_date, onboarding_status, cs_owner_id, onboarding_owner_id, success_owner_id, churn_risk,
        last_contact_date, raw_properties, last_synced_at, updated_at
      )
      SELECT * FROM UNNEST(
        $1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[],
        $8::text[], $9::text[], $10::numeric[], $11::numeric[], $12::date[],
        $13::date[], $14::text[], $15::text[], $16::text[], $17::text[], $18::text[],
        $19::timestamptz[], $20::jsonb[], $21::timestamptz[], $22::timestamptz[]
      ) AS t(hubspot_id, name, domain, industry, city, country, phone,
             lifecycle_stage, plan, mrr, contract_value, contract_start_date,
             renewal_date, onboarding_status, cs_owner_id, onboarding_owner_id, success_owner_id, churn_risk,
             last_contact_date, raw_properties, last_synced_at, updated_at)
      ON CONFLICT (hubspot_id) DO UPDATE SET
        name                 = EXCLUDED.name,
        domain               = EXCLUDED.domain,
        industry             = EXCLUDED.industry,
        city                 = EXCLUDED.city,
        country              = EXCLUDED.country,
        phone                = EXCLUDED.phone,
        lifecycle_stage      = EXCLUDED.lifecycle_stage,
        plan                 = EXCLUDED.plan,
        mrr                  = EXCLUDED.mrr,
        contract_value       = EXCLUDED.contract_value,
        contract_start_date  = EXCLUDED.contract_start_date,
        renewal_date         = EXCLUDED.renewal_date,
        onboarding_status    = COALESCE(EXCLUDED.onboarding_status, clients.onboarding_status),
        cs_owner_id          = EXCLUDED.cs_owner_id,
        onboarding_owner_id  = EXCLUDED.onboarding_owner_id,
        success_owner_id     = EXCLUDED.success_owner_id,
        churn_risk           = EXCLUDED.churn_risk,
        last_contact_date    = EXCLUDED.last_contact_date,
        raw_properties       = EXCLUDED.raw_properties,
        last_synced_at       = NOW(),
        updated_at           = NOW()`,
      [
        hubspotIds, names, domains, industries, cities, countries, phones,
        lifecycleStages, plans, mrrs, contractValues, contractStartDates,
        renewalDates, onboardingStatuses,
        chunk.map(c => c.companyOwnerId),
        chunk.map(c => c.onboardingOwnerId),
        chunk.map(c => c.successOwnerId),
        churnRisks,
        chunk.map(c => c.lastContactDate ? new Date(c.lastContactDate) : null),
        rawProps,
        chunk.map(() => new Date()),
        chunk.map(() => new Date()),
      ]
    );
    count += chunk.length;
  }

  return count;
}

// ─── Contacts ─────────────────────────────────────────────────────────────────

async function syncContacts(contacts: HSContact[]): Promise<number> {
  if (contacts.length === 0) return 0;

  // Build hubspot_id → internal client UUID map
  const companyHubspotIds = [...new Set(contacts.map(c => c.companyId).filter(Boolean))] as string[];
  const clientMap: Record<string, string> = {};

  if (companyHubspotIds.length > 0) {
    const res = await pgQuery<{ hubspot_id: string; id: string }>(
      `SELECT hubspot_id, id FROM clients WHERE hubspot_id = ANY($1::text[])`,
      [companyHubspotIds]
    );
    for (const row of res.rows) clientMap[row.hubspot_id] = row.id;
  }

  const CHUNK = 200;
  let count = 0;

  for (let i = 0; i < contacts.length; i += CHUNK) {
    const chunk = contacts.slice(i, i + CHUNK);

    await pgQuery(
      `INSERT INTO contacts (
        hubspot_id, client_id, email, first_name, last_name,
        phone, job_title, lifecycle_stage, owner_id,
        last_activity_at, communication_roles, raw_properties, last_synced_at, updated_at
      )
      SELECT * FROM UNNEST(
        $1::text[], $2::uuid[], $3::text[], $4::text[], $5::text[],
        $6::text[], $7::text[], $8::text[], $9::text[],
        $10::timestamptz[], $11::text[][], $12::jsonb[], $13::timestamptz[], $14::timestamptz[]
      ) AS t(hubspot_id, client_id, email, first_name, last_name,
             phone, job_title, lifecycle_stage, owner_id,
             last_activity_at, communication_roles, raw_properties, last_synced_at, updated_at)
      ON CONFLICT (hubspot_id) DO UPDATE SET
        client_id           = EXCLUDED.client_id,
        email               = EXCLUDED.email,
        first_name          = EXCLUDED.first_name,
        last_name           = EXCLUDED.last_name,
        phone               = EXCLUDED.phone,
        job_title           = EXCLUDED.job_title,
        lifecycle_stage     = EXCLUDED.lifecycle_stage,
        owner_id            = EXCLUDED.owner_id,
        last_activity_at    = EXCLUDED.last_activity_at,
        communication_roles = EXCLUDED.communication_roles,
        raw_properties      = EXCLUDED.raw_properties,
        last_synced_at      = NOW(),
        updated_at          = NOW()`,
      [
        chunk.map(c => c.id),
        chunk.map(c => (c.companyId ? clientMap[c.companyId] ?? null : null)),
        chunk.map(c => c.email),
        chunk.map(c => c.firstName),
        chunk.map(c => c.lastName),
        chunk.map(c => c.phone),
        chunk.map(c => c.jobTitle),
        chunk.map(c => c.lifecycleStage),
        chunk.map(c => c.ownerId),
        chunk.map(c => c.lastActivityDate ? new Date(c.lastActivityDate) : null),
        chunk.map(c => c.communicationRoles),
        chunk.map(c => JSON.stringify(c.rawProperties)),
        chunk.map(() => new Date()),
        chunk.map(() => new Date()),
      ]
    );
    count += chunk.length;
  }

  return count;
}

// ─── Tickets ──────────────────────────────────────────────────────────────────

async function syncTickets(tickets: HSTicket[]): Promise<number> {
  if (tickets.length === 0) return 0;

  const companyHubspotIds = [...new Set(tickets.map(t => t.companyId).filter(Boolean))] as string[];
  const clientMap: Record<string, string> = {};

  if (companyHubspotIds.length > 0) {
    const res = await pgQuery<{ hubspot_id: string; id: string }>(
      `SELECT hubspot_id, id FROM clients WHERE hubspot_id = ANY($1::text[])`,
      [companyHubspotIds]
    );
    for (const row of res.rows) clientMap[row.hubspot_id] = row.id;
  }

  const CHUNK = 200;
  let count = 0;

  for (let i = 0; i < tickets.length; i += CHUNK) {
    const chunk = tickets.slice(i, i + CHUNK);

    await pgQuery(
      `INSERT INTO tickets (
        hubspot_id, client_id, subject, content, status,
        priority, pipeline, owner_id, opened_at, closed_at,
        last_modified_at, raw_properties, last_synced_at
      )
      SELECT * FROM UNNEST(
        $1::text[], $2::uuid[], $3::text[], $4::text[], $5::text[],
        $6::text[], $7::text[], $8::text[], $9::timestamptz[], $10::timestamptz[],
        $11::timestamptz[], $12::jsonb[], $13::timestamptz[]
      ) AS t(hubspot_id, client_id, subject, content, status,
             priority, pipeline, owner_id, opened_at, closed_at,
             last_modified_at, raw_properties, last_synced_at)
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
        chunk.map(t => t.id),
        chunk.map(t => (t.companyId ? clientMap[t.companyId] ?? null : null)),
        chunk.map(t => t.subject),
        chunk.map(t => t.content),
        chunk.map(t => t.status),
        chunk.map(t => t.priority),
        chunk.map(t => t.pipeline),
        chunk.map(t => t.ownerId),
        chunk.map(t => t.openedAt ? new Date(t.openedAt) : null),
        chunk.map(t => t.closedAt ? new Date(t.closedAt) : null),
        chunk.map(t => t.lastModifiedAt ? new Date(t.lastModifiedAt) : null),
        chunk.map(t => JSON.stringify(t.rawProperties)),
        chunk.map(() => new Date()),
      ]
    );
    count += chunk.length;
  }

  return count;
}

// ─── Engagements ─────────────────────────────────────────────────────────────

async function syncEngagements(engagements: HSEngagement[]): Promise<number> {
  if (engagements.length === 0) return 0;

  const companyHubspotIds = [...new Set(engagements.map(e => e.companyId).filter(Boolean))] as string[];
  const contactHubspotIds = [...new Set(engagements.map(e => e.contactId).filter(Boolean))] as string[];

  const clientMap: Record<string, string> = {};
  const contactMap: Record<string, string> = {};

  if (companyHubspotIds.length > 0) {
    const res = await pgQuery<{ hubspot_id: string; id: string }>(
      `SELECT hubspot_id, id FROM clients WHERE hubspot_id = ANY($1::text[])`,
      [companyHubspotIds]
    );
    for (const row of res.rows) clientMap[row.hubspot_id] = row.id;
  }

  if (contactHubspotIds.length > 0) {
    const res = await pgQuery<{ hubspot_id: string; id: string }>(
      `SELECT hubspot_id, id FROM contacts WHERE hubspot_id = ANY($1::text[])`,
      [contactHubspotIds]
    );
    for (const row of res.rows) contactMap[row.hubspot_id] = row.id;
  }

  const CHUNK = 200;
  let count = 0;

  for (let i = 0; i < engagements.length; i += CHUNK) {
    const chunk = engagements.slice(i, i + CHUNK);

    await pgQuery(
      `INSERT INTO engagements (
        hubspot_id, client_id, contact_id, type, occurred_at,
        owner_id, title, raw_properties, last_synced_at
      )
      SELECT * FROM UNNEST(
        $1::text[], $2::uuid[], $3::uuid[], $4::text[], $5::timestamptz[],
        $6::text[], $7::text[], $8::jsonb[], $9::timestamptz[]
      ) AS t(hubspot_id, client_id, contact_id, type, occurred_at,
             owner_id, title, raw_properties, last_synced_at)
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
        chunk.map(e => e.id),
        chunk.map(e => (e.companyId ? clientMap[e.companyId] ?? null : null)),
        chunk.map(e => (e.contactId ? contactMap[e.contactId] ?? null : null)),
        chunk.map(e => e.type),
        chunk.map(e => new Date(e.occurredAt)),
        chunk.map(e => e.ownerId),
        chunk.map(e => e.title),
        chunk.map(e => JSON.stringify(e.rawProperties)),
        chunk.map(() => new Date()),
      ]
    );
    count += chunk.length;
  }

  return count;
}

// ─── Single-type exports (for step-by-step sync) ─────────────────────────────
export const syncCompaniesOnly = syncCompanies;
export const syncContactsOnly = syncContacts;
export const syncTicketsOnly = syncTickets;
export const syncEngagementsOnly = syncEngagements;

// ─── Main sync ────────────────────────────────────────────────────────────────

export async function runFullSync(): Promise<SyncResult> {
  const start = Date.now();
  const errors: string[] = [];
  const result: SyncResult = { companies: 0, contacts: 0, tickets: 0, engagements: 0, errors, durationMs: 0 };

  const client = getHubSpotClient();

  try {
    logger.info('Starting HubSpot full sync');

    // Fetch sequentially to respect HubSpot rate limits
    const [companies, contacts, tickets, engagements] = await Promise.allSettled([
      client.getCompanies().then(r => { logger.info(`Fetched ${r.length} companies from HubSpot`); return r; }),
      new Promise<Awaited<ReturnType<typeof client.getContacts>>>(res =>
        setTimeout(() => client.getContacts().then(r => { logger.info(`Fetched ${r.length} contacts`); res(r); }), 2000)
      ),
      new Promise<Awaited<ReturnType<typeof client.getTickets>>>(res =>
        setTimeout(() => client.getTickets().then(r => { logger.info(`Fetched ${r.length} tickets`); res(r); }), 4000)
      ),
      new Promise<Awaited<ReturnType<typeof client.getEngagements>>>(res =>
        setTimeout(() => client.getEngagements().then(r => { logger.info(`Fetched ${r.length} engagements`); res(r); }), 6000)
      ),
    ]);

    // Sync in order (contacts/tickets need companies first)
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
  logger.info('HubSpot sync complete', { companies: result.companies, contacts: result.contacts, tickets: result.tickets, engagements: result.engagements, durationMs: result.durationMs });
  return result;
}
