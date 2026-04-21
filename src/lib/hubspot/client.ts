/**
 * HubSpot API client for Post-Sales data.
 * Reads companies, contacts, tickets, engagements, and can derive company MRR from associated deals.
 * Supports workflow listing and enrollment via v4 automation API.
 */

import axios, { type AxiosInstance } from 'axios';
import { config } from '@/lib/config';
import { getLogger } from '@/lib/logger';
import {
  HUBSPOT_COMPANY_PROPS,
  HUBSPOT_CONTACT_PROPS,
  HUBSPOT_TICKET_PROPS,
  HUBSPOT_DEAL_PROPS,
  HUBSPOT_DEAL_SYNC,
} from '@/lib/config/hubspot-props';

const logger = getLogger('hubspot:client');

/** Properties requested for engagement batch/read and list (email subject/body, meeting notes, call notes). */
const ENGAGEMENT_BATCH_PROPERTIES = [
  'hs_engagement_type',
  'hs_timestamp',
  'hs_createdate',
  'hubspot_owner_id',
  'hs_engagement_source',
  'hs_activity_type',
  'hs_email_from_email',
  'hs_email_from_firstname',
  'hs_email_from_lastname',
  'hs_email_to_email',
  'hs_email_to_firstname',
  'hs_email_to_lastname',
  'hs_email_subject',
  'hs_email_text',
  'hs_call_direction',
  'hs_call_disposition',
  'hs_call_title',
  'hs_call_to_number',
  'hs_call_body',
  'hs_meeting_title',
  'hs_meeting_body',
  'hs_meeting_start_time',
  'hs_meeting_end_time',
  'hs_meeting_outcome',
  'hs_internal_meeting_notes',
  'hs_task_subject',
  'hs_task_status',
  'hs_task_priority',
  'hs_task_type',
  'hs_note_body',
  'hs_body_preview',
] as const;

function hubspotErrMeta(err: unknown): { status?: number; body?: string; message: string } {
  const r = err as { response?: { status?: number; data?: unknown }; message?: string };
  const status = r.response?.status;
  const data = r.response?.data;
  const body = data != null ? (typeof data === 'string' ? data : JSON.stringify(data)) : undefined;
  return { status, body, message: r.message ?? String(err) };
}

/** Company MRR is filled from deals when HubSpot value is missing, invalid, or not positive. */
export function companyNeedsDealMrrEnrichment(c: HSCompany): boolean {
  if (c.mrr == null) return true;
  if (!Number.isFinite(c.mrr)) return true;
  return c.mrr <= 0;
}

export interface MrrEnrichmentStats {
  companiesNeedingMrr: number;
  companiesWithDealLinks: number;
  dealsFetched: number;
  companiesEnriched: number;
  associationErrors: number;
  dealBatchErrors: number;
}

export interface HSCompany {
  id: string;
  name: string | null;
  domain: string | null;
  industry: string | null;
  city: string | null;
  country: string | null;
  phone: string | null;
  lifecycleStage: string | null;
  plan: string | null;
  mrr: number | null;
  contractValue: number | null;
  contractStartDate: string | null;
  renewalDate: string | null;
  onboardingStatus: string | null;
  companyOwnerId: string | null;
  onboardingOwnerId: string | null;
  successOwnerId: string | null;
  churnRisk: string | null;
  lastContactDate: string | null;
  createDate: string | null;
  rawProperties: Record<string, unknown>;
}

export interface HSContact {
  id: string;
  companyId: string | null;
  /** True when the contact is the company's primary contact (HubSpot association typeId 2). */
  isPrimaryForCompany: boolean;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  jobTitle: string | null;
  lifecycleStage: string | null;
  ownerId: string | null;
  lastActivityDate: string | null;
  communicationRoles: string[];
  createDate: string | null;
  rawProperties: Record<string, unknown>;
}

/** HubSpot association typeId for "Primary Contact" on Company → Contact. */
const PRIMARY_CONTACT_ASSOC_TYPE_ID = 2;

export interface HSTicket {
  id: string;
  companyId: string | null;
  subject: string | null;
  content: string | null;
  status: string | null;
  priority: string | null;
  pipeline: string | null;
  ownerId: string | null;
  openedAt: string | null;
  closedAt: string | null;
  lastModifiedAt: string | null;
  activatedAt: string | null;
  rawProperties: Record<string, unknown>;
}

export interface HSEngagement {
  id: string;
  companyId: string | null;
  contactId: string | null;
  type: string;
  occurredAt: string;
  ownerId: string | null;
  title: string | null;
  rawProperties: Record<string, unknown>;
}

export interface HSDeal {
  id: string;
  companyHubspotId: string;
  pipelineId: string;
  stageId: string;
  dealName: string | null;
  amount: number | null;
  closeDate: string | null;
  ownerId: string | null;
  stageEnteredAt: string | null;
}

class HubSpotClient {
  private http: AxiosInstance;

  constructor(apiKey: string) {
    this.http = axios.create({
      baseURL: config.hubspot.baseUrl,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });
  }

  private async getWithRetry(
    url: string,
    params: Record<string, unknown>,
    options?: { method?: 'GET' | 'POST'; data?: unknown },
    attempt = 0
  ): Promise<{ data: unknown }> {
    try {
      if (options?.method === 'POST') {
        return await this.http.post(url, options.data);
      }
      return await this.http.get(url, { params });
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 429 && attempt < 5) {
        const wait = Math.pow(2, attempt) * 1000 + Math.random() * 500;
        logger.warn(`HubSpot rate limit hit, retrying in ${Math.round(wait)}ms (attempt ${attempt + 1})`);
        await new Promise(r => setTimeout(r, wait));
        return this.getWithRetry(url, params, options, attempt + 1);
      }
      const meta = hubspotErrMeta(err);
      logger.error('HubSpot request failed', {
        url,
        method: options?.method ?? 'GET',
        status: meta.status,
        body: meta.body?.slice(0, 800),
        message: meta.message,
      });
      throw err;
    }
  }

  private async fetchAllPages<T>(
    url: string,
    params: Record<string, unknown>,
    transform: (item: { id: string; properties: Record<string, string | null> }) => T
  ): Promise<T[]> {
    const results: T[] = [];
    let after: string | undefined;

    do {
      const response = await this.getWithRetry(url, { ...params, ...(after ? { after } : {}) });

      const { results: items, paging } = response.data as {
        results: Array<{ id: string; properties: Record<string, string | null> }>;
        paging?: { next?: { after: string } };
      };

      for (const item of items) {
        results.push(transform(item));
      }

      after = paging?.next?.after;
    } while (after);

    return results;
  }

  private async fetchAllPagesWithAssociations<T>(
    url: string,
    params: Record<string, unknown>,
    associationType: string,
    transform: (item: { id: string; properties: Record<string, string | null> }, associations: string[]) => T
  ): Promise<T[]> {
    const results: T[] = [];
    let after: string | undefined;

    do {
      const response = await this.getWithRetry(url, { ...params, associations: associationType, ...(after ? { after } : {}) });

      const { results: items, paging } = response.data as {
        results: Array<{
          id: string;
          properties: Record<string, string | null>;
          associations?: Record<string, { results: Array<{ id: string }> }>;
        }>;
        paging?: { next?: { after: string } };
      };

      for (const item of items) {
        const assocIds = item.associations?.[associationType]?.results?.map(a => a.id) ?? [];
        results.push(transform(item, assocIds));
      }

      after = paging?.next?.after;
    } while (after);

    return results;
  }

  async getCompanies(): Promise<HSCompany[]> {
    logger.info('Fetching companies from HubSpot (filtered by post-sales owners)');
    const props = Object.values(HUBSPOT_COMPANY_PROPS).join(',');

    // Post-sales portfolio = companies owned by Customer Success, Customer Support, or Partner Success.
    // The HubSpot Search API caps results at 10k per query; restricting to these teams keeps the
    // result set well below that limit (~4.8k) and avoids the 400 that occurs when paginating past 10k.
    const { HUBSPOT_OWNERS } = await import('@/lib/config/owners');
    const POST_SALES_TEAMS = new Set(['Customer Success', 'Customer Support', 'Partner Success']);
    const ownerIds = Object.values(HUBSPOT_OWNERS)
      .filter(o => POST_SALES_TEAMS.has(o.team))
      .map(o => o.id);

    const results: HSCompany[] = [];
    let after: string | undefined;

    // HubSpot search: filterGroups with OR logic — one group per owner field
    const filterGroups = [
      { filters: [{ propertyName: 'hubspot_owner_id', operator: 'IN', values: ownerIds }] },
      { filters: [{ propertyName: 'customer_onboarding_owner', operator: 'IN', values: ownerIds }] },
      { filters: [{ propertyName: 'customer_success_owner', operator: 'IN', values: ownerIds }] },
    ];

    do {
      const response = await this.getWithRetry('/crm/v3/objects/companies/search', {}, {
        method: 'POST',
        data: {
          filterGroups,
          properties: props.split(','),
          limit: 100,
          ...(after ? { after } : {}),
        }
      });

      const { results: items, paging } = response.data as {
        results: Array<{ id: string; properties: Record<string, string | null> }>;
        paging?: { next?: { after: string } };
      };

      for (const { id, properties: p } of items) {
        results.push({
          id,
          name: p[HUBSPOT_COMPANY_PROPS.name] ?? null,
          domain: p[HUBSPOT_COMPANY_PROPS.domain] ?? null,
          industry: p[HUBSPOT_COMPANY_PROPS.industry] ?? null,
          city: p[HUBSPOT_COMPANY_PROPS.city] ?? null,
          country: p[HUBSPOT_COMPANY_PROPS.country] ?? null,
          phone: p[HUBSPOT_COMPANY_PROPS.phone] ?? null,
          lifecycleStage: p[HUBSPOT_COMPANY_PROPS.lifecycleStage] ?? null,
          plan: p[HUBSPOT_COMPANY_PROPS.plan] ?? null,
          mrr: p[HUBSPOT_COMPANY_PROPS.mrr] ? parseFloat(p[HUBSPOT_COMPANY_PROPS.mrr]!) : null,
          contractValue: p[HUBSPOT_COMPANY_PROPS.contractValue] ? parseFloat(p[HUBSPOT_COMPANY_PROPS.contractValue]!) : null,
          contractStartDate: p[HUBSPOT_COMPANY_PROPS.contractStartDate] ?? null,
          renewalDate: p[HUBSPOT_COMPANY_PROPS.renewalDate] ?? null,
          onboardingStatus: p[HUBSPOT_COMPANY_PROPS.onboardingStatus] ?? null,
          companyOwnerId: p[HUBSPOT_COMPANY_PROPS.companyOwner] ?? null,
          onboardingOwnerId: p[HUBSPOT_COMPANY_PROPS.onboardingOwner] ?? null,
          successOwnerId: p[HUBSPOT_COMPANY_PROPS.successOwner] ?? null,
          churnRisk: p[HUBSPOT_COMPANY_PROPS.churnRisk] ?? null,
          lastContactDate: (() => {
            const d1 = p[HUBSPOT_COMPANY_PROPS.notesLastUpdated];
            const d2 = p[HUBSPOT_COMPANY_PROPS.lastBookedMeeting];
            if (!d1 && !d2) return null;
            if (!d1) return d2;
            if (!d2) return d1;
            return new Date(d1) > new Date(d2) ? d1 : d2;
          })(),
          createDate: p[HUBSPOT_COMPANY_PROPS.createDate] ?? null,
          rawProperties: p as Record<string, unknown>,
        });
      }

      after = paging?.next?.after;
    } while (after);

    logger.info(`Fetched ${results.length} companies (CS-owned)`);
    return results;
  }

  async getCompaniesLegacy(): Promise<HSCompany[]> {
    logger.info('Fetching all companies from HubSpot (no filter)');
    const props = Object.values(HUBSPOT_COMPANY_PROPS).join(',');

    return this.fetchAllPages(
      '/crm/v3/objects/companies',
      { limit: 100, properties: props },
      ({ id, properties: p }) => ({
        id,
        name: p[HUBSPOT_COMPANY_PROPS.name] ?? null,
        domain: p[HUBSPOT_COMPANY_PROPS.domain] ?? null,
        industry: p[HUBSPOT_COMPANY_PROPS.industry] ?? null,
        city: p[HUBSPOT_COMPANY_PROPS.city] ?? null,
        country: p[HUBSPOT_COMPANY_PROPS.country] ?? null,
        phone: p[HUBSPOT_COMPANY_PROPS.phone] ?? null,
        lifecycleStage: p[HUBSPOT_COMPANY_PROPS.lifecycleStage] ?? null,
        plan: p[HUBSPOT_COMPANY_PROPS.plan] ?? null,
        mrr: p[HUBSPOT_COMPANY_PROPS.mrr] ? parseFloat(p[HUBSPOT_COMPANY_PROPS.mrr]!) : null,
        contractValue: p[HUBSPOT_COMPANY_PROPS.contractValue] ? parseFloat(p[HUBSPOT_COMPANY_PROPS.contractValue]!) : null,
        contractStartDate: p[HUBSPOT_COMPANY_PROPS.contractStartDate] ?? null,
        renewalDate: p[HUBSPOT_COMPANY_PROPS.renewalDate] ?? null,
          onboardingStatus: p[HUBSPOT_COMPANY_PROPS.onboardingStatus] ?? null,
          companyOwnerId: p[HUBSPOT_COMPANY_PROPS.companyOwner] ?? null,
          onboardingOwnerId: p[HUBSPOT_COMPANY_PROPS.onboardingOwner] ?? null,
          successOwnerId: p[HUBSPOT_COMPANY_PROPS.successOwner] ?? null,
          churnRisk: p[HUBSPOT_COMPANY_PROPS.churnRisk] ?? null,
          lastContactDate: (() => {
            const d1 = p[HUBSPOT_COMPANY_PROPS.notesLastUpdated];
            const d2 = p[HUBSPOT_COMPANY_PROPS.lastBookedMeeting];
            if (!d1 && !d2) return null;
            if (!d1) return d2;
            if (!d2) return d1;
            return new Date(d1) > new Date(d2) ? d1 : d2;
          })(),
        createDate: p[HUBSPOT_COMPANY_PROPS.createDate] ?? null,
        rawProperties: p as Record<string, unknown>,
      })
    );
  }

  async getContacts(): Promise<HSContact[]> {
    logger.info('Fetching all contacts from HubSpot (unfiltered - legacy)');
    const props = Object.values(HUBSPOT_CONTACT_PROPS).join(',');

    return this.fetchAllPagesWithAssociations(
      '/crm/v3/objects/contacts',
      { limit: 100, properties: props },
      'companies',
      ({ id, properties: p }, companyIds) => ({
        id,
        companyId: companyIds[0] ?? null,
        // Legacy unfiltered fetch doesn't expose association types; primary flag
        // is reconciled by getContactsForCompanies (v4) which is the path used by sync.
        isPrimaryForCompany: false,
        email: p[HUBSPOT_CONTACT_PROPS.email] ?? null,
        firstName: p[HUBSPOT_CONTACT_PROPS.firstName] ?? null,
        lastName: p[HUBSPOT_CONTACT_PROPS.lastName] ?? null,
        phone: p[HUBSPOT_CONTACT_PROPS.phone] ?? null,
        jobTitle: p[HUBSPOT_CONTACT_PROPS.jobTitle] ?? null,
        lifecycleStage: p[HUBSPOT_CONTACT_PROPS.lifecycleStage] ?? null,
        ownerId: p[HUBSPOT_CONTACT_PROPS.ownerId] ?? null,
        lastActivityDate: p[HUBSPOT_CONTACT_PROPS.lastActivityDate] ?? null,
        communicationRoles: p[HUBSPOT_CONTACT_PROPS.communicationRole]
          ? p[HUBSPOT_CONTACT_PROPS.communicationRole]!.split(';').map(r => r.trim()).filter(Boolean)
          : [],
        createDate: p[HUBSPOT_CONTACT_PROPS.createDate] ?? null,
        rawProperties: p as Record<string, unknown>,
      })
    );
  }

  /**
   * Fetches only contacts associated with the given HubSpot company IDs.
   * Uses v4 associations batch API + contacts batch/read — much faster than fetching all contacts.
   */
  async getContactsForCompanies(companyHubspotIds: string[]): Promise<HSContact[]> {
    if (companyHubspotIds.length === 0) return [];
    logger.info(`Fetching contacts for ${companyHubspotIds.length} companies via associations API`);

    const props = Object.values(HUBSPOT_CONTACT_PROPS).join(',');
    const BATCH = 100;

    // Step 1: resolve company → contact IDs via v4 associations batch
    const contactToCompanyMap: Record<string, { companyId: string; isPrimary: boolean }> = {};

    for (let i = 0; i < companyHubspotIds.length; i += BATCH) {
      const slice = companyHubspotIds.slice(i, i + BATCH);
      try {
        const res = await this.getWithRetry('/crm/v4/associations/companies/contacts/batch/read', {}, {
          method: 'POST',
          data: { inputs: slice.map(id => ({ id })) },
        });
        const data = res.data as {
          results: Array<{
            from: { id: string };
            to: Array<{
              toObjectId: string;
              associationTypes?: Array<{ category?: string; typeId?: number; label?: string | null }>;
            }>;
          }>;
        };
        for (const item of data.results ?? []) {
          for (const assoc of item.to ?? []) {
            const isPrimary = (assoc.associationTypes ?? []).some(
              t => t.typeId === PRIMARY_CONTACT_ASSOC_TYPE_ID
            );
            const existing = contactToCompanyMap[assoc.toObjectId];
            if (!existing) {
              contactToCompanyMap[assoc.toObjectId] = { companyId: item.from.id, isPrimary };
            } else if (isPrimary && !existing.isPrimary) {
              // Prefer the company association where this contact is marked Primary.
              contactToCompanyMap[assoc.toObjectId] = { companyId: item.from.id, isPrimary };
            }
          }
        }
      } catch (err) {
        logger.warn(`Associations batch failed for slice ${i}-${i + BATCH}`, { error: String(err) });
      }
    }

    const contactIds = Object.keys(contactToCompanyMap);
    if (contactIds.length === 0) return [];
    logger.info(`Found ${contactIds.length} unique contacts across synced companies`);

    // Step 2: fetch contact details in batches of 100
    const results: HSContact[] = [];

    for (let i = 0; i < contactIds.length; i += BATCH) {
      const slice = contactIds.slice(i, i + BATCH);
      try {
        const res = await this.getWithRetry('/crm/v3/objects/contacts/batch/read', {}, {
          method: 'POST',
          data: {
            inputs: slice.map(id => ({ id })),
            properties: props.split(','),
          },
        });
        const data = res.data as { results: Array<{ id: string; properties: Record<string, string | null> }> };
        for (const item of data.results ?? []) {
          const p = item.properties;
          const assoc = contactToCompanyMap[item.id];
          results.push({
            id: item.id,
            companyId: assoc?.companyId ?? null,
            isPrimaryForCompany: assoc?.isPrimary ?? false,
            email: p[HUBSPOT_CONTACT_PROPS.email] ?? null,
            firstName: p[HUBSPOT_CONTACT_PROPS.firstName] ?? null,
            lastName: p[HUBSPOT_CONTACT_PROPS.lastName] ?? null,
            phone: p[HUBSPOT_CONTACT_PROPS.phone] ?? null,
            jobTitle: p[HUBSPOT_CONTACT_PROPS.jobTitle] ?? null,
            lifecycleStage: p[HUBSPOT_CONTACT_PROPS.lifecycleStage] ?? null,
            ownerId: p[HUBSPOT_CONTACT_PROPS.ownerId] ?? null,
            lastActivityDate: p[HUBSPOT_CONTACT_PROPS.lastActivityDate] ?? null,
            communicationRoles: p[HUBSPOT_CONTACT_PROPS.communicationRole]
              ? p[HUBSPOT_CONTACT_PROPS.communicationRole]!.split(';').map(r => r.trim()).filter(Boolean)
              : [],
            createDate: p[HUBSPOT_CONTACT_PROPS.createDate] ?? null,
            rawProperties: p as Record<string, unknown>,
          });
        }
      } catch (err) {
        logger.warn(`Contact batch/read failed for slice ${i}-${i + BATCH}`, { error: String(err) });
      }
    }

    logger.info(`Fetched ${results.length} contacts for synced companies`);
    return results;
  }

  async getTickets(): Promise<HSTicket[]> {
    logger.info('Fetching all tickets from HubSpot');
    const props = Object.values(HUBSPOT_TICKET_PROPS).join(',');

    return this.fetchAllPagesWithAssociations(
      '/crm/v3/objects/tickets',
      { limit: 100, properties: props },
      'companies',
      ({ id, properties: p }, companyIds) => ({
        id,
        companyId: companyIds[0] ?? null,
        subject: p[HUBSPOT_TICKET_PROPS.subject] ?? null,
        content: p[HUBSPOT_TICKET_PROPS.content] ?? null,
        status: p[HUBSPOT_TICKET_PROPS.status] ?? null,
        priority: p[HUBSPOT_TICKET_PROPS.priority] ?? null,
        pipeline: p[HUBSPOT_TICKET_PROPS.pipeline] ?? null,
        ownerId: p[HUBSPOT_TICKET_PROPS.ownerId] ?? null,
        openedAt: p[HUBSPOT_TICKET_PROPS.createDate] ?? null,
        closedAt: p[HUBSPOT_TICKET_PROPS.closeDate] ?? null,
        lastModifiedAt: p[HUBSPOT_TICKET_PROPS.lastModifiedDate] ?? null,
        activatedAt: p[HUBSPOT_TICKET_PROPS.activatedAt] ?? null,
        rawProperties: p as Record<string, unknown>,
      })
    );
  }

  /**
   * Fetches only engagements associated with the given HubSpot company IDs.
   * Uses v4 associations batch API + engagements batch/read.
   */
  async getEngagementsForCompanies(companyHubspotIds: string[]): Promise<HSEngagement[]> {
    if (companyHubspotIds.length === 0) return [];
    logger.info(`Fetching engagements for ${companyHubspotIds.length} companies via associations API`);

    const BATCH = 100;
    const engagementToCompanyMap: Record<string, string> = {};

    // Step 1: resolve company → engagement IDs
    for (let i = 0; i < companyHubspotIds.length; i += BATCH) {
      const slice = companyHubspotIds.slice(i, i + BATCH);
      try {
        const res = await this.getWithRetry('/crm/v4/associations/companies/engagements/batch/read', {}, {
          method: 'POST',
          data: { inputs: slice.map(id => ({ id })) },
        });
        const data = res.data as { results: Array<{ from: { id: string }; to: Array<{ toObjectId: string | number }> }> };
        for (const item of data.results ?? []) {
          for (const assoc of item.to ?? []) {
            const eid = String(assoc.toObjectId);
            if (!engagementToCompanyMap[eid]) {
              engagementToCompanyMap[eid] = item.from.id;
            }
          }
        }
      } catch (err) {
        logger.warn(`Engagement associations batch failed for slice ${i}-${i + BATCH}`, { error: String(err) });
      }
    }

    const engagementIds = Object.keys(engagementToCompanyMap);
    if (engagementIds.length === 0) return [];
    logger.info(`Found ${engagementIds.length} unique engagements for synced companies`);

    // Step 2: fetch engagement details in batches
    const results: HSEngagement[] = [];

    for (let i = 0; i < engagementIds.length; i += BATCH) {
      const slice = engagementIds.slice(i, i + BATCH);
      try {
        const res = await this.getWithRetry('/crm/v3/objects/engagements/batch/read', {}, {
          method: 'POST',
          data: {
            inputs: slice.map(id => ({ id })),
            properties: [...ENGAGEMENT_BATCH_PROPERTIES],
          },
        });
        const data = res.data as { results: Array<{ id: string; properties: Record<string, string | null> }> };
        for (const item of data.results ?? []) {
          const p = item.properties;
          const occurredAt = p['hs_timestamp'];
          if (!occurredAt) continue;
          results.push({
            id: item.id,
            companyId: engagementToCompanyMap[item.id] ?? null,
            contactId: null,
            type: p['hs_engagement_type'] ?? 'UNKNOWN',
            occurredAt,
            ownerId: p['hubspot_owner_id'] ?? null,
            title: p['hs_engagement_source'] ?? null,
            rawProperties: p as Record<string, unknown>,
          });
        }
      } catch (err) {
        logger.warn(`Engagement batch/read failed for slice ${i}-${i + BATCH}`, { error: String(err) });
      }
    }

    logger.info(`Fetched ${results.length} engagements for synced companies`);
    return results;
  }

  async getEngagementsForContacts(contactHubspotIds: string[]): Promise<HSEngagement[]> {
    if (contactHubspotIds.length === 0) return [];
    logger.info(`Fetching engagements for ${contactHubspotIds.length} contacts via associations API`);

    const BATCH = 100;
    const engagementToContactMap: Record<string, string> = {};

    for (let i = 0; i < contactHubspotIds.length; i += BATCH) {
      const slice = contactHubspotIds.slice(i, i + BATCH);
      try {
        const res = await this.getWithRetry('/crm/v4/associations/contacts/engagements/batch/read', {}, {
          method: 'POST',
          data: { inputs: slice.map(id => ({ id })) },
        });
        const data = res.data as { results: Array<{ from: { id: string }; to: Array<{ toObjectId: string | number }> }> };
        for (const item of data.results ?? []) {
          for (const assoc of item.to ?? []) {
            const eid = String(assoc.toObjectId);
            if (!engagementToContactMap[eid]) {
              engagementToContactMap[eid] = item.from.id;
            }
          }
        }
      } catch (err) {
        logger.warn(`Contact engagement associations batch failed for slice ${i}-${i + BATCH}`, { error: String(err) });
      }
    }

    const engagementIds = Object.keys(engagementToContactMap);
    if (engagementIds.length === 0) return [];
    logger.info(`Found ${engagementIds.length} unique engagements for contacts`);

    const results: HSEngagement[] = [];

    for (let i = 0; i < engagementIds.length; i += BATCH) {
      const slice = engagementIds.slice(i, i + BATCH);
      try {
        const res = await this.getWithRetry('/crm/v3/objects/engagements/batch/read', {}, {
          method: 'POST',
          data: {
            inputs: slice.map(id => ({ id })),
            properties: [...ENGAGEMENT_BATCH_PROPERTIES],
          },
        });
        const data = res.data as { results: Array<{ id: string; properties: Record<string, string | null> }> };
        for (const item of data.results ?? []) {
          const p = item.properties;
          const occurredAt = p['hs_timestamp'];
          if (!occurredAt) continue;
          results.push({
            id: item.id,
            companyId: null,
            contactId: engagementToContactMap[item.id] ?? null,
            type: p['hs_engagement_type'] ?? 'UNKNOWN',
            occurredAt,
            ownerId: p['hubspot_owner_id'] ?? null,
            title: p['hs_engagement_source'] ?? null,
            rawProperties: p as Record<string, unknown>,
          });
        }
      } catch (err) {
        logger.warn(`Contact engagement batch/read failed for slice ${i}-${i + BATCH}`, { error: String(err) });
      }
    }

    logger.info(`Fetched ${results.length} engagements for contacts`);
    return results;
  }

  async getEngagements(): Promise<HSEngagement[]> {
    logger.info('Fetching engagements from HubSpot');

    const results: HSEngagement[] = [];
    let after: string | undefined;

    do {
      const response = await this.http.get('/crm/v3/objects/engagements', {
        params: {
          limit: 100,
          properties: ENGAGEMENT_BATCH_PROPERTIES.join(','),
          associations: 'companies,contacts',
          ...(after ? { after } : {}),
        },
      });

      const { results: items, paging } = response.data as {
        results: Array<{
          id: string;
          properties: Record<string, string | null>;
          associations?: Record<string, { results: Array<{ id: string }> }>;
        }>;
        paging?: { next?: { after: string } };
      };

      for (const item of items) {
        const p = item.properties;
        const companyId = item.associations?.['companies']?.results?.[0]?.id ?? null;
        const contactId = item.associations?.['contacts']?.results?.[0]?.id ?? null;
        const occurredAt = p['hs_timestamp'];
        if (!occurredAt) continue;

        results.push({
          id: item.id,
          companyId,
          contactId,
          type: p['hs_engagement_type'] ?? 'UNKNOWN',
          occurredAt,
          ownerId: p['hubspot_owner_id'] ?? null,
          title: p['hs_engagement_source'] ?? null,
          rawProperties: p as Record<string, unknown>,
        });
      }

      after = paging?.next?.after;
    } while (after);

    return results;
  }

  private static readonly OBJECT_TYPE_LABELS: Record<string, string> = {
    '0-1': 'contacts',
    '0-2': 'companies',
    '0-5': 'tickets',
  };

  private static parseWorkflowAllowlist(): Set<string> | null {
    const raw = process.env.HUBSPOT_WORKFLOW_ALLOWLIST?.trim();
    if (!raw) return null;
    return new Set(raw.split(',').map(id => id.trim()).filter(Boolean));
  }

  async getWorkflows(): Promise<Array<{ id: string; name: string; isEnabled: boolean; objectTypeId: string; type: string; updatedAt: string }>> {
    logger.info('Fetching workflows from HubSpot');

    type HSFlow = { id: string; name: string; isEnabled: boolean; objectTypeId: string; type: string; updatedAt?: string };
    const all: HSFlow[] = [];
    let after: string | undefined;

    do {
      const response = await this.getWithRetry('/automation/v4/flows', after ? { after } : {});
      const data = response.data as { results?: HSFlow[]; paging?: { next?: { after: string } } };
      if (data.results) all.push(...data.results);
      after = data.paging?.next?.after;
    } while (after);

    const allowlist = HubSpotClient.parseWorkflowAllowlist();
    const filtered = allowlist ? all.filter(f => allowlist.has(f.id)) : all;

    logger.info(`Fetched ${all.length} workflows from HubSpot, returning ${filtered.length}${allowlist ? ` (allowlist: ${allowlist.size} IDs)` : ''}`);

    return filtered.map(f => ({
      id: f.id,
      name: f.name ?? `Workflow ${f.id}`,
      isEnabled: f.isEnabled,
      objectTypeId: f.objectTypeId,
      type: HubSpotClient.OBJECT_TYPE_LABELS[f.objectTypeId] ?? f.objectTypeId,
      updatedAt: f.updatedAt ?? '',
    }));
  }

  private static readonly OBJECT_TYPE_IDS: Record<string, string> = {
    contacts: '0-1',
    companies: '0-2',
    tickets: '0-5',
  };

  /**
   * Maps a v4 flowId to the legacy v2 workflowId via the migration endpoint.
   * Required because the v2 enrollment endpoint only accepts v2 IDs.
   */
  private async mapFlowIdToWorkflowId(flowId: string): Promise<string> {
    const res = await this.http.post('/automation/v4/workflow-id-mappings/batch/read', {
      inputs: [{ flowMigrationStatuses: flowId, type: 'FLOW_ID' }],
    });
    const data = res.data as { results?: Array<{ flowId: number; workflowId: number }> };
    const mapped = data.results?.[0]?.workflowId;
    if (!mapped) throw new Error(`Could not map v4 flowId ${flowId} to v2 workflowId`);
    return String(mapped);
  }

  async enrollInWorkflow(
    workflowId: string,
    objectId: string,
    objectType: 'contacts' | 'companies' | 'tickets',
    contactEmail?: string
  ): Promise<void> {
    logger.info(`Enrolling ${objectType} ${objectId} in workflow ${workflowId}`);

    if (objectType === 'contacts') {
      if (!contactEmail) throw new Error('contactEmail is required for contact enrollment');
      const v2Id = await this.mapFlowIdToWorkflowId(workflowId);
      logger.info(`Mapped v4 flowId ${workflowId} -> v2 workflowId ${v2Id}`);
      await this.http.post(
        `/automation/v2/workflows/${v2Id}/enrollments/contacts/${encodeURIComponent(contactEmail)}`,
      );
    } else {
      await this.http.post(
        `/automation/v4/flows/${workflowId}/enrollments`,
        { objectId, objectType: HubSpotClient.OBJECT_TYPE_IDS[objectType] },
      );
    }

    logger.info(`Successfully enrolled ${objectType} ${objectId} in workflow ${workflowId}`);
  }

  private async fetchDealIdsForCompany(companyId: string): Promise<string[]> {
    const res = await this.getWithRetry(`/crm/v4/objects/companies/${companyId}/associations/deals`, {});
    const data = res.data as { results?: Array<{ toObjectId: string | number }> };
    return (data.results ?? []).map(r => String(r.toObjectId));
  }

  /**
   * Fills `mrr` on companies where HubSpot company MRR is missing or not positive, using associated deals
   * (closed-won by default). Private app: scope `crm.objects.deals.read` (e lettura associazioni).
   */
  async enrichCompaniesMrrFromDeals(companies: HSCompany[]): Promise<MrrEnrichmentStats> {
    const emptyStats = (): MrrEnrichmentStats => ({
      companiesNeedingMrr: 0,
      companiesWithDealLinks: 0,
      dealsFetched: 0,
      companiesEnriched: 0,
      associationErrors: 0,
      dealBatchErrors: 0,
    });

    const targets = companies.filter(companyNeedsDealMrrEnrichment);
    const stats = emptyStats();
    stats.companiesNeedingMrr = targets.length;
    if (targets.length === 0) return stats;

    const dealPropList = [
      HUBSPOT_DEAL_PROPS.mrr,
      HUBSPOT_DEAL_PROPS.amount,
      HUBSPOT_DEAL_PROPS.closedWon,
      HUBSPOT_DEAL_PROPS.dealstage,
    ];
    const dealProps = dealPropList.join(',');

    const companyToDealIds = new Map<string, string[]>();
    const ASSOC_BATCH = 100;

    for (let i = 0; i < targets.length; i += ASSOC_BATCH) {
      const slice = targets.slice(i, i + ASSOC_BATCH);
      try {
        const res = await this.getWithRetry('/crm/v4/associations/companies/deals/batch/read', {}, {
          method: 'POST',
          data: { inputs: slice.map(c => ({ id: c.id })) },
        });
        const { results } = res.data as {
          results: Array<{ from?: { id?: string }; to?: Array<{ toObjectId: string | number }> }>;
        };
        for (const row of results ?? []) {
          const cid = row.from?.id;
          if (!cid) continue;
          const ids = (row.to ?? []).map(t => String(t.toObjectId));
          const prev = companyToDealIds.get(cid) ?? [];
          companyToDealIds.set(cid, [...new Set([...prev, ...ids])]);
        }
      } catch (e) {
        const { status, body, message } = hubspotErrMeta(e);
        stats.associationErrors++;
        logger.warn('HubSpot company→deal associations batch failed; falling back to per-company reads', {
          status,
          body,
          message,
        });
        for (const c of slice) {
          try {
            const ids = await this.fetchDealIdsForCompany(c.id);
            if (ids.length === 0) continue;
            const prev = companyToDealIds.get(c.id) ?? [];
            companyToDealIds.set(c.id, [...new Set([...prev, ...ids])]);
          } catch (e2) {
            const m = hubspotErrMeta(e2);
            logger.warn('HubSpot company→deal association GET failed', { companyId: c.id, status: m.status, message: m.message });
          }
        }
      }
    }

    for (const c of targets) {
      if ((companyToDealIds.get(c.id) ?? []).length > 0) stats.companiesWithDealLinks++;
    }

    const allDealIds = [...new Set([...companyToDealIds.values()].flat())];
    if (allDealIds.length === 0) {
      logger.info('No associated deals found for companies needing MRR from deals');
      return stats;
    }

    const dealPropsById = new Map<string, Record<string, string | null>>();
    const DEAL_BATCH = 100;

    for (let i = 0; i < allDealIds.length; i += DEAL_BATCH) {
      const batch = allDealIds.slice(i, i + DEAL_BATCH);
      try {
        const res = await this.getWithRetry('/crm/v3/objects/deals/batch/read', {}, {
          method: 'POST',
          data: { properties: dealPropList, inputs: batch.map(id => ({ id })) },
        });
        const { results } = res.data as {
          results: Array<{ id: string; properties: Record<string, string | null> }>;
        };
        for (const r of results ?? []) {
          dealPropsById.set(r.id, r.properties);
        }
      } catch (e) {
        stats.dealBatchErrors++;
        const { status, body, message } = hubspotErrMeta(e);
        logger.warn('HubSpot deals batch/read failed during MRR enrichment', { status, body, message });
      }
    }

    stats.dealsFetched = dealPropsById.size;

    const wonStages = HUBSPOT_DEAL_SYNC.wonDealStageIds;

    const closedWon = (p: Record<string, string | null>): boolean => {
      if (!HUBSPOT_DEAL_SYNC.onlyClosedWonDeals) return true;
      if (p[HUBSPOT_DEAL_PROPS.closedWon] === 'true') return true;
      if (wonStages.length > 0) {
        const st = p[HUBSPOT_DEAL_PROPS.dealstage];
        return st != null && wonStages.includes(st);
      }
      return false;
    };

    const monthlyFromDeal = (p: Record<string, string | null>): number => {
      const mrrStr = p[HUBSPOT_DEAL_PROPS.mrr];
      const mrr = mrrStr != null && mrrStr !== '' ? parseFloat(mrrStr) : NaN;
      if (Number.isFinite(mrr) && mrr > 0) return mrr;
      if (HUBSPOT_DEAL_SYNC.fallbackAnnualAmountToMonthly) {
        const amtStr = p[HUBSPOT_DEAL_PROPS.amount];
        const amt = amtStr != null && amtStr !== '' ? parseFloat(amtStr) : NaN;
        if (Number.isFinite(amt) && amt > 0) return amt / 12;
      }
      return 0;
    };

    for (const c of targets) {
      const dealIds = companyToDealIds.get(c.id);
      if (!dealIds?.length) continue;
      let sum = 0;
      const seen = new Set<string>();
      for (const did of dealIds) {
        if (seen.has(did)) continue;
        seen.add(did);
        const p = dealPropsById.get(did);
        if (!p || !closedWon(p)) continue;
        sum += monthlyFromDeal(p);
      }
      if (sum > 0) {
        c.mrr = Math.round(sum * 100) / 100;
        stats.companiesEnriched++;
      }
    }

    if (stats.companiesEnriched > 0) {
      logger.info(
        `Enriched MRR from deals for companies with missing or non-positive HubSpot MRR: ${JSON.stringify(stats)}`
      );
    }

    return stats;
  }

  private static readonly PURCHASE_SOURCE_LABELS: Record<string, string> = {
    product_led: 'Product Led',
    Inbound: 'Sales Led',
    Outbound: 'Sales Led',
    'Customer Led': 'Customer Led',
    partner: 'Partner Led',
  };

  async getPurchaseSourcesForCompanies(companyHubspotIds: string[]): Promise<Record<string, string>> {
    if (companyHubspotIds.length === 0) return {};
    logger.info(`Fetching purchase sources for ${companyHubspotIds.length} companies`);

    const BATCH = 100;
    const companyToDealIds: Record<string, string[]> = {};

    for (let i = 0; i < companyHubspotIds.length; i += BATCH) {
      const slice = companyHubspotIds.slice(i, i + BATCH);
      try {
        const res = await this.getWithRetry('/crm/v4/associations/companies/deals/batch/read', {}, {
          method: 'POST',
          data: { inputs: slice.map(id => ({ id })) },
        });
        const data = res.data as { results: Array<{ from: { id: string }; to: Array<{ toObjectId: string | number }> }> };
        for (const item of data.results ?? []) {
          const dealIds = (item.to ?? []).map(a => String(a.toObjectId));
          if (dealIds.length > 0) companyToDealIds[item.from.id] = dealIds;
        }
      } catch (err) {
        logger.warn(`Deal associations batch failed for slice ${i}`, { error: String(err) });
      }
    }

    const allDealIds = [...new Set(Object.values(companyToDealIds).flat())];
    if (allDealIds.length === 0) return {};
    logger.info(`Found ${allDealIds.length} deals associated with companies, fetching details`);

    const dealData: Record<string, { source: string | null; pipeline: string | null; stage: string | null; closedate: string | null }> = {};

    for (let i = 0; i < allDealIds.length; i += BATCH) {
      const slice = allDealIds.slice(i, i + BATCH);
      try {
        const res = await this.getWithRetry('/crm/v3/objects/deals/batch/read', {}, {
          method: 'POST',
          data: {
            inputs: slice.map(id => ({ id })),
            properties: ['spoki_purchase_source', 'pipeline', 'dealstage', 'closedate'],
          },
        });
        const data = res.data as { results: Array<{ id: string; properties: Record<string, string | null> }> };
        for (const deal of data.results ?? []) {
          dealData[deal.id] = {
            source: deal.properties.spoki_purchase_source,
            pipeline: deal.properties.pipeline,
            stage: deal.properties.dealstage,
            closedate: deal.properties.closedate,
          };
        }
      } catch (err) {
        logger.warn(`Deal batch/read failed for slice ${i}`, { error: String(err) });
      }
    }

    const result: Record<string, string> = {};
    for (const [companyId, dealIds] of Object.entries(companyToDealIds)) {
      const closedWonDeals = dealIds
        .map(id => ({ id, ...dealData[id] }))
        .filter(d => d.pipeline === '671838099' && d.stage === '986053469' && d.source)
        .sort((a, b) => (a.closedate ?? '').localeCompare(b.closedate ?? ''));

      const firstDeal = closedWonDeals[0];
      if (firstDeal?.source) {
        result[companyId] = HubSpotClient.PURCHASE_SOURCE_LABELS[firstDeal.source] ?? firstDeal.source;
      }
    }

    logger.info(`Found purchase sources for ${Object.keys(result).length} companies`);
    return result;
  }

  /**
   * For each company id returns the HubSpot owner id of the most recent closed-won deal,
   * which represents the Sales rep that closed the contract. Falls back to the most recent
   * deal owner if no closed-won deal is found.
   */
  async getSalesOwnersForCompanies(companyHubspotIds: string[]): Promise<Record<string, string>> {
    if (companyHubspotIds.length === 0) return {};
    logger.info(`Fetching sales owners for ${companyHubspotIds.length} companies`);

    const BATCH = 100;
    const companyToDealIds: Record<string, string[]> = {};

    for (let i = 0; i < companyHubspotIds.length; i += BATCH) {
      const slice = companyHubspotIds.slice(i, i + BATCH);
      try {
        const res = await this.getWithRetry('/crm/v4/associations/companies/deals/batch/read', {}, {
          method: 'POST',
          data: { inputs: slice.map(id => ({ id })) },
        });
        const data = res.data as { results: Array<{ from: { id: string }; to: Array<{ toObjectId: string | number }> }> };
        for (const item of data.results ?? []) {
          const dealIds = (item.to ?? []).map(a => String(a.toObjectId));
          if (dealIds.length > 0) companyToDealIds[item.from.id] = dealIds;
        }
      } catch (err) {
        logger.warn(`Sales-owner deal associations batch failed for slice ${i}`, { error: String(err) });
      }
    }

    const allDealIds = [...new Set(Object.values(companyToDealIds).flat())];
    if (allDealIds.length === 0) return {};

    const dealData: Record<string, { ownerId: string | null; closedWon: boolean; closedate: string | null }> = {};

    for (let i = 0; i < allDealIds.length; i += BATCH) {
      const slice = allDealIds.slice(i, i + BATCH);
      try {
        const res = await this.getWithRetry('/crm/v3/objects/deals/batch/read', {}, {
          method: 'POST',
          data: {
            inputs: slice.map(id => ({ id })),
            properties: ['hubspot_owner_id', HUBSPOT_DEAL_PROPS.closedWon, 'closedate'],
          },
        });
        const data = res.data as { results: Array<{ id: string; properties: Record<string, string | null> }> };
        for (const deal of data.results ?? []) {
          dealData[deal.id] = {
            ownerId: deal.properties['hubspot_owner_id'] || null,
            closedWon: deal.properties[HUBSPOT_DEAL_PROPS.closedWon] === 'true',
            closedate: deal.properties.closedate || null,
          };
        }
      } catch (err) {
        logger.warn(`Sales-owner deals batch/read failed for slice ${i}`, { error: String(err) });
      }
    }

    const result: Record<string, string> = {};
    for (const [companyId, dealIds] of Object.entries(companyToDealIds)) {
      const deals = dealIds
        .map(id => ({ id, ...dealData[id] }))
        .filter(d => d.ownerId);

      const closedWonSorted = deals
        .filter(d => d.closedWon)
        .sort((a, b) => (b.closedate ?? '').localeCompare(a.closedate ?? ''));

      const fallbackSorted = deals.sort((a, b) => (b.closedate ?? '').localeCompare(a.closedate ?? ''));

      const ownerId = closedWonSorted[0]?.ownerId ?? fallbackSorted[0]?.ownerId ?? null;
      if (ownerId) result[companyId] = ownerId;
    }

    logger.info(`Found sales owners for ${Object.keys(result).length} companies`);
    return result;
  }

  async fetchDealsForCompanies(companyHubspotIds: string[]): Promise<HSDeal[]> {
    if (companyHubspotIds.length === 0) return [];

    const { TRACKED_PIPELINE_IDS, DEAL_PIPELINES } = await import('@/lib/config/deal-pipelines');

    const BATCH = 100;
    const companyToDealIds = new Map<string, string[]>();

    for (let i = 0; i < companyHubspotIds.length; i += BATCH) {
      const slice = companyHubspotIds.slice(i, i + BATCH);
      try {
        const res = await this.getWithRetry('/crm/v4/associations/companies/deals/batch/read', {}, {
          method: 'POST',
          data: { inputs: slice.map(id => ({ id })) },
        });
        const { results } = res.data as {
          results: Array<{ from?: { id?: string }; to?: Array<{ toObjectId: string | number }> }>;
        };
        for (const row of results ?? []) {
          const cid = row.from?.id;
          if (!cid) continue;
          const ids = (row.to ?? []).map(t => String(t.toObjectId));
          if (ids.length > 0) {
            const prev = companyToDealIds.get(cid) ?? [];
            companyToDealIds.set(cid, [...new Set([...prev, ...ids])]);
          }
        }
      } catch (err) {
        const { message } = hubspotErrMeta(err);
        logger.warn('Deal associations batch failed', { message });
      }
    }

    const allDealIds = [...new Set([...companyToDealIds.values()].flat())];
    if (allDealIds.length === 0) return [];

    logger.info(`Fetching ${allDealIds.length} deals for pipeline sync`);

    const dealProps = ['dealname', 'amount', 'pipeline', 'dealstage', 'closedate', 'hubspot_owner_id'];

    const allStageIds = TRACKED_PIPELINE_IDS.flatMap(pid =>
      Object.keys(DEAL_PIPELINES[pid].stages)
    );
    const dateEnteredProps = allStageIds.map(sid => `hs_date_entered_${sid}`);
    const propsToFetch = [...dealProps, ...dateEnteredProps];

    const dealById = new Map<string, Record<string, string | null>>();

    for (let i = 0; i < allDealIds.length; i += BATCH) {
      const batch = allDealIds.slice(i, i + BATCH);
      try {
        const res = await this.getWithRetry('/crm/v3/objects/deals/batch/read', {}, {
          method: 'POST',
          data: { properties: propsToFetch, inputs: batch.map(id => ({ id })) },
        });
        const { results } = res.data as {
          results: Array<{ id: string; properties: Record<string, string | null> }>;
        };
        for (const r of results ?? []) {
          dealById.set(r.id, r.properties);
        }
      } catch (err) {
        const { message } = hubspotErrMeta(err);
        logger.warn('Deal batch/read failed', { message });
      }
    }

    const dealIdToCompany = new Map<string, string>();
    for (const [companyId, dids] of companyToDealIds) {
      for (const did of dids) dealIdToCompany.set(did, companyId);
    }

    const results: HSDeal[] = [];
    const trackedSet = new Set<string>(TRACKED_PIPELINE_IDS as unknown as string[]);

    for (const [dealId, props] of dealById) {
      const pipelineId = props.pipeline ?? '';
      if (!trackedSet.has(pipelineId)) continue;

      const stageId = props.dealstage ?? '';
      const companyHubspotId = dealIdToCompany.get(dealId);
      if (!companyHubspotId) continue;

      const dateEnteredKey = `hs_date_entered_${stageId}`;
      const stageEnteredAt = props[dateEnteredKey] ?? null;

      const amtStr = props.amount;
      const amount = amtStr ? parseFloat(amtStr) : null;

      results.push({
        id: dealId,
        companyHubspotId,
        pipelineId,
        stageId,
        dealName: props.dealname ?? null,
        amount: amount && Number.isFinite(amount) ? Math.round(amount * 100) / 100 : null,
        closeDate: props.closedate ?? null,
        ownerId: props.hubspot_owner_id ?? null,
        stageEnteredAt,
      });
    }

    logger.info(`Found ${results.length} deals in tracked pipelines`);
    return results;
  }

  async createNoteOnCompany(companyHubspotId: string, body: string): Promise<string> {
    const noteRes = await this.http.post('/crm/v3/objects/notes', {
      properties: { hs_note_body: body, hs_timestamp: new Date().toISOString() },
    });
    const noteId = (noteRes.data as { id: string }).id;

    await this.http.put(
      `/crm/v4/objects/notes/${noteId}/associations/companies/${companyHubspotId}`,
      [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 202 }]
    );

    return noteId;
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.http.get('/crm/v3/objects/companies', { params: { limit: 1 } });
      return true;
    } catch {
      return false;
    }
  }
}

let instance: HubSpotClient | null = null;

export function getHubSpotClient(): HubSpotClient {
  if (!instance) {
    if (!config.hubspot.apiKey) throw new Error('HUBSPOT_API_KEY is not set');
    instance = new HubSpotClient(config.hubspot.apiKey);
  }
  return instance;
}
