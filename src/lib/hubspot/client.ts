/**
 * HubSpot API client for Post-Sales data.
 * Reads companies, contacts, tickets, engagements.
 * Supports workflow listing and enrollment via v4 automation API.
 */

import axios, { type AxiosInstance } from 'axios';
import { config } from '@/lib/config';
import { getLogger } from '@/lib/logger';
import {
  HUBSPOT_COMPANY_PROPS,
  HUBSPOT_CONTACT_PROPS,
  HUBSPOT_TICKET_PROPS,
} from '@/lib/config/hubspot-props';

const logger = getLogger('hubspot:client');

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
    logger.info('Fetching companies from HubSpot (filtered by CS owner)');
    const props = Object.values(HUBSPOT_COMPANY_PROPS).join(',');

    // Fetch companies where ANY of the three owner fields matches a known CS/Support team member
    const { HUBSPOT_OWNERS } = await import('@/lib/config/owners');
    const ownerIds = Object.keys(HUBSPOT_OWNERS);

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
    const contactToCompanyMap: Record<string, string> = {};

    for (let i = 0; i < companyHubspotIds.length; i += BATCH) {
      const slice = companyHubspotIds.slice(i, i + BATCH);
      try {
        const res = await this.getWithRetry('/crm/v4/associations/companies/contacts/batch/read', {}, {
          method: 'POST',
          data: { inputs: slice.map(id => ({ id })) },
        });
        const data = res.data as { results: Array<{ from: { id: string }; to: Array<{ toObjectId: string }> }> };
        for (const item of data.results ?? []) {
          for (const assoc of item.to ?? []) {
            // Keep first company found per contact
            if (!contactToCompanyMap[assoc.toObjectId]) {
              contactToCompanyMap[assoc.toObjectId] = item.from.id;
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
          results.push({
            id: item.id,
            companyId: contactToCompanyMap[item.id] ?? null,
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
            properties: ['hs_engagement_type', 'hs_timestamp', 'hubspot_owner_id', 'hs_engagement_source', 'hs_email_from_email', 'hs_email_from_firstname', 'hs_email_from_lastname', 'hs_email_to_email', 'hs_email_to_firstname', 'hs_email_to_lastname', 'hs_call_direction', 'hs_call_disposition', 'hs_call_title', 'hs_call_to_number'],
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
            properties: ['hs_engagement_type', 'hs_timestamp', 'hubspot_owner_id', 'hs_engagement_source', 'hs_email_from_email', 'hs_email_from_firstname', 'hs_email_from_lastname', 'hs_email_to_email', 'hs_email_to_firstname', 'hs_email_to_lastname', 'hs_call_direction', 'hs_call_disposition', 'hs_call_title', 'hs_call_to_number'],
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
          properties: 'hs_engagement_type,hs_timestamp,hubspot_owner_id,hs_engagement_source,hs_email_from_email,hs_email_from_firstname,hs_email_from_lastname,hs_email_to_email,hs_email_to_firstname,hs_email_to_lastname,hs_call_direction,hs_call_disposition,hs_call_title,hs_call_to_number',
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

    logger.info(`Fetched ${all.length} workflows from HubSpot`);

    return all.map(f => ({
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

  async enrollInWorkflow(
    workflowId: string,
    objectId: string,
    objectType: 'contacts' | 'companies' | 'tickets'
  ): Promise<void> {
    logger.info(`Enrolling ${objectType} ${objectId} in workflow ${workflowId}`);

    if (objectType === 'contacts') {
      await this.http.post(
        `/automation/v2/workflows/${workflowId}/enrollments/contacts/${objectId}`,
      );
    } else {
      await this.http.post(
        `/automation/v4/flows/${workflowId}/enrollments`,
        { objectId, objectType: HubSpotClient.OBJECT_TYPE_IDS[objectType] },
      );
    }

    logger.info(`Successfully enrolled ${objectType} ${objectId} in workflow ${workflowId}`);
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
