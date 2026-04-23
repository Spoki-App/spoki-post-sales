/**
 * HubSpot → PostgreSQL sync engine.
 * Uses batch upserts (UNNEST) for performance — one query per object type instead of N queries.
 */

import { pgQuery } from '@/lib/db/postgres';
import {
  getHubSpotClient,
  type HSCompany,
  type HSContact,
  type HSTicket,
  type HSEngagement,
  type HSDeal,
  type MrrEnrichmentStats,
} from './client';
import { getLogger } from '@/lib/logger';
import { HUBSPOT_COMPANY_PROPS, SYNC_RAW_PRIMARY_CONTACT_HUBSPOT_ID_KEY } from '@/lib/config/hubspot-props';

const logger = getLogger('hubspot:sync');

/**
 * Only these keys are persisted in raw_properties JSONB to keep DB size manageable.
 * Everything else from HubSpot is discarded at sync time.
 */
const ENGAGEMENT_RAW_KEEP = new Set([
  'hs_activity_type', 'hs_createdate',
  'hs_email_from_email', 'hs_email_from_firstname', 'hs_email_from_lastname',
  'hs_email_to_email', 'hs_email_to_firstname', 'hs_email_to_lastname',
  'hs_email_subject', 'hs_email_text',
  'hs_call_direction', 'hs_call_disposition', 'hs_call_title', 'hs_call_body',
  'hs_meeting_title', 'hs_meeting_body', 'hs_internal_meeting_notes',
  'hs_meeting_start_time', 'hs_meeting_end_time', 'hs_meeting_outcome',
  'hs_task_subject', 'hs_task_status', 'hs_task_priority', 'hs_task_type',
  'hs_note_body', 'hs_body_preview',
]);

const TICKET_RAW_KEEP = new Set([
  'hs_pipeline', 'hs_pipeline_stage', 'hs_ticket_priority',
  'subject', 'content',
]);

const TRUNCATE_AT = 500;

function companyRawPropertyKeysForDb(): Set<string> {
  const keys = new Set<string>();
  const addIfValid = (internal: string) => {
    const k = internal.trim();
    if (k && /^[a-zA-Z0-9_]+$/.test(k)) keys.add(k);
  };
  addIfValid(HUBSPOT_COMPANY_PROPS.primaryContactHubspotId);
  addIfValid(HUBSPOT_COMPANY_PROPS.conversationsUsed);
  addIfValid(HUBSPOT_COMPANY_PROPS.conversationsIncluded);
  addIfValid(HUBSPOT_COMPANY_PROPS.accountQualityScore);
  return keys;
}

const ENGAGEMENT_RAW_TRUNCATE = new Set([
  'hs_email_text', 'hs_body_preview', 'hs_note_body',
  'hs_call_body', 'hs_meeting_body', 'hs_internal_meeting_notes',
]);

/** Serialize to JSON safe for PostgreSQL JSONB (strips null bytes, control chars, lone surrogates). */
function safeJsonb(obj: unknown): string {
  try {
    let json = JSON.stringify(obj);
    // eslint-disable-next-line no-control-regex
    json = json.replace(/\u0000/g, '').replace(/\\u0000/g, '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
    return json;
  } catch {
    return '{}';
  }
}

function pickKeys(obj: Record<string, unknown> | undefined | null, allowed: Set<string>, truncateKeys?: Set<string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!obj) return out;
  for (const k of allowed) {
    if (k in obj && obj[k] != null && obj[k] !== '') {
      let v = obj[k];
      if (typeof v === 'string') {
        let s = v.replace(/\u0000/g, '');
        if (truncateKeys?.has(k) && s.length > TRUNCATE_AT) {
          s = s.slice(0, TRUNCATE_AT);
        }
        v = s;
      }
      out[k] = v;
    }
  }
  return out;
}

export interface SyncResult {
  companies: number;
  contacts: number;
  tickets: number;
  engagements: number;
  deals: number;
  errors: string[];
  durationMs: number;
  mrrEnrichment?: MrrEnrichmentStats;
}

// ─── Companies ────────────────────────────────────────────────────────────────

async function syncCompanies(companies: HSCompany[]): Promise<number> {
  if (companies.length === 0) return 0;

  const hubspot = getHubSpotClient();
  const primaryByCompanyHubspotId = await hubspot.getCompanyPrimaryContactHubspotIds(companies.map(c => c.id));

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
    const companyRawKeep = companyRawPropertyKeysForDb();
    const rawProps = chunk.map(c => {
      const base = pickKeys(c.rawProperties, companyRawKeep);
      const primaryVid = primaryByCompanyHubspotId[c.id];
      if (primaryVid) {
        (base as Record<string, unknown>)[SYNC_RAW_PRIMARY_CONTACT_HUBSPOT_ID_KEY] = primaryVid;
      }
      return safeJsonb(base);
    });

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
        $10::timestamptz[], $11::text[], $12::jsonb[], $13::timestamptz[], $14::timestamptz[]
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
        chunk.map(c => c.communicationRoles.join(';') || null),
        chunk.map(() => JSON.stringify({})),
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
        last_modified_at, activated_at, raw_properties, last_synced_at
      )
      SELECT * FROM UNNEST(
        $1::text[], $2::uuid[], $3::text[], $4::text[], $5::text[],
        $6::text[], $7::text[], $8::text[], $9::timestamptz[], $10::timestamptz[],
        $11::timestamptz[], $12::timestamptz[], $13::jsonb[], $14::timestamptz[]
      ) AS t(hubspot_id, client_id, subject, content, status,
             priority, pipeline, owner_id, opened_at, closed_at,
             last_modified_at, activated_at, raw_properties, last_synced_at)
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
        activated_at     = EXCLUDED.activated_at,
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
        chunk.map(t => t.activatedAt ? new Date(Number(t.activatedAt) > 1e12 ? Number(t.activatedAt) : t.activatedAt) : null),
        chunk.map(t => safeJsonb(pickKeys(t.rawProperties, TICKET_RAW_KEEP))),
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
  const contactHubToClientId: Record<string, string> = {};

  if (companyHubspotIds.length > 0) {
    const res = await pgQuery<{ hubspot_id: string; id: string }>(
      `SELECT hubspot_id, id FROM clients WHERE hubspot_id = ANY($1::text[])`,
      [companyHubspotIds]
    );
    for (const row of res.rows) clientMap[row.hubspot_id] = row.id;
  }

  if (contactHubspotIds.length > 0) {
    const res = await pgQuery<{ hubspot_id: string; id: string; client_id: string | null }>(
      `SELECT hubspot_id, id, client_id FROM contacts WHERE hubspot_id = ANY($1::text[])`,
      [contactHubspotIds]
    );
    for (const row of res.rows) {
      contactMap[row.hubspot_id] = row.id;
      if (row.client_id) contactHubToClientId[row.hubspot_id] = row.client_id;
    }
  }

  const CHUNK = 200;
  let count = 0;

  for (let i = 0; i < engagements.length; i += CHUNK) {
    const chunk = engagements.slice(i, i + CHUNK);

    try {
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
          chunk.map(e => {
            if (e.companyId && clientMap[e.companyId]) return clientMap[e.companyId];
            if (e.contactId && contactHubToClientId[e.contactId]) return contactHubToClientId[e.contactId];
            return null;
          }),
          chunk.map(e => (e.contactId ? contactMap[e.contactId] ?? null : null)),
          chunk.map(e => e.type),
          chunk.map(e => new Date(e.occurredAt)),
          chunk.map(e => e.ownerId),
          // eslint-disable-next-line no-control-regex
          chunk.map(e => e.title ? e.title.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '') : e.title),
          chunk.map(e => safeJsonb(pickKeys(e.rawProperties, ENGAGEMENT_RAW_KEEP, ENGAGEMENT_RAW_TRUNCATE))),
          chunk.map(() => new Date()),
        ]
      );
      count += chunk.length;
    } catch (err) {
      logger.error('Engagement chunk failed, skipping', { offset: i, size: chunk.length, error: String(err) });
    }
  }

  return count;
}

// ─── Deals ───────────────────────────────────────────────────────────────────

async function syncDeals(deals: HSDeal[]): Promise<number> {
  if (deals.length === 0) return 0;

  const companyHubspotIds = [...new Set(deals.map(d => d.companyHubspotId))];
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

  for (let i = 0; i < deals.length; i += CHUNK) {
    const chunk = deals.slice(i, i + CHUNK);

    await pgQuery(
      `INSERT INTO deals (
        hubspot_id, client_id, pipeline_id, stage_id, deal_name,
        amount, close_date, owner_id, stage_entered_at, updated_at
      )
      SELECT * FROM UNNEST(
        $1::text[], $2::uuid[], $3::text[], $4::text[], $5::text[],
        $6::numeric[], $7::date[], $8::text[], $9::timestamptz[], $10::timestamptz[]
      ) AS t(hubspot_id, client_id, pipeline_id, stage_id, deal_name,
             amount, close_date, owner_id, stage_entered_at, updated_at)
      ON CONFLICT (hubspot_id) DO UPDATE SET
        client_id        = EXCLUDED.client_id,
        pipeline_id      = EXCLUDED.pipeline_id,
        stage_id         = EXCLUDED.stage_id,
        deal_name        = EXCLUDED.deal_name,
        amount           = EXCLUDED.amount,
        close_date       = EXCLUDED.close_date,
        owner_id         = EXCLUDED.owner_id,
        stage_entered_at = EXCLUDED.stage_entered_at,
        updated_at       = NOW()`,
      [
        chunk.map(d => d.id),
        chunk.map(d => clientMap[d.companyHubspotId] ?? null),
        chunk.map(d => d.pipelineId),
        chunk.map(d => d.stageId),
        chunk.map(d => d.dealName),
        chunk.map(d => d.amount),
        chunk.map(d => d.closeDate ? new Date(d.closeDate) : null),
        chunk.map(d => d.ownerId),
        chunk.map(d => d.stageEnteredAt ? new Date(d.stageEnteredAt) : null),
        chunk.map(() => new Date()),
      ]
    );
    count += chunk.length;
  }

  return count;
}

// ─── Update onboarding stage from tickets ────────────────────────────────────

async function updateOnboardingStages(): Promise<number> {
  const { ONBOARDING_PIPELINE_ID, ONBOARDING_STAGES } = await import('@/lib/config/pipelines');

  // For each client, find the most recent ticket in the Onboarding pipeline
  const res = await pgQuery<{ client_id: string; hs_pipeline_stage: string }>(
    `SELECT DISTINCT ON (client_id)
       client_id, status AS hs_pipeline_stage
     FROM tickets
     WHERE pipeline = $1
       AND client_id IS NOT NULL
     ORDER BY client_id, opened_at DESC NULLS LAST`,
    [ONBOARDING_PIPELINE_ID]
  );

  let updated = 0;
  for (const row of res.rows) {
    const stage = ONBOARDING_STAGES[row.hs_pipeline_stage];
    if (!stage) continue;
    await pgQuery(
      `UPDATE clients SET onboarding_stage = $1, onboarding_stage_type = $2, updated_at = NOW() WHERE id = $3`,
      [stage.label, stage.type, row.client_id]
    );
    updated++;
  }

  return updated;
}

// ─── Single-type exports (for step-by-step sync) ─────────────────────────────
export const syncCompaniesOnly = syncCompanies;
export const syncContactsOnly = syncContacts;
export const syncEngagementsOnly = syncEngagements;
export const syncDealsOnly = syncDeals;

export async function syncTicketsOnly(tickets: HSTicket[]): Promise<number> {
  const count = await syncTickets(tickets);
  await updateOnboardingStages();
  return count;
}

// ─── Main sync ────────────────────────────────────────────────────────────────

export async function runFullSync(): Promise<SyncResult> {
  const start = Date.now();
  const errors: string[] = [];
  const result: SyncResult = { companies: 0, contacts: 0, tickets: 0, engagements: 0, deals: 0, errors, durationMs: 0 };

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
      result.mrrEnrichment = await client.enrichCompaniesMrrFromDeals(companies.value);
      result.companies = await syncCompanies(companies.value);
      logger.info(
        `Synced ${result.companies} companies; MRR deal enrichment: ${JSON.stringify(result.mrrEnrichment)}`
      );
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

    // Sync deals from tracked pipelines (Sales + Upselling)
    if (companies.status === 'fulfilled') {
      try {
        const companyIds = companies.value.map(c => c.id);
        const hsDeals = await client.fetchDealsForCompanies(companyIds);
        result.deals = await syncDeals(hsDeals);
        logger.info(`Synced ${result.deals} deals`);
      } catch (err) {
        errors.push(`deals: ${String(err)}`);
        logger.error('Failed to sync deals', { error: String(err) });
      }
    }

  } catch (err) {
    errors.push(`sync: ${String(err)}`);
    logger.error('Sync failed', { error: String(err) });
  }

  result.durationMs = Date.now() - start;
  logger.info('HubSpot sync complete', { companies: result.companies, contacts: result.contacts, tickets: result.tickets, engagements: result.engagements, deals: result.deals, durationMs: result.durationMs });
  return result;
}
