/**
 * HubSpot API v3 client for Post-Sales data.
 * Reads companies, contacts, tickets, and engagements.
 * Fetches HubSpot data read-only; all writes go to local PostgreSQL.
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
  csOwnerId: string | null;
  churnRisk: string | null;
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

  private async fetchAllPages<T>(
    url: string,
    params: Record<string, unknown>,
    transform: (item: { id: string; properties: Record<string, string | null> }) => T
  ): Promise<T[]> {
    const results: T[] = [];
    let after: string | undefined;

    do {
      const response = await this.http.get(url, {
        params: { ...params, ...(after ? { after } : {}) },
      });

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
      const response = await this.http.get(url, {
        params: { ...params, associations: associationType, ...(after ? { after } : {}) },
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
        const assocIds = item.associations?.[associationType]?.results?.map(a => a.id) ?? [];
        results.push(transform(item, assocIds));
      }

      after = paging?.next?.after;
    } while (after);

    return results;
  }

  async getCompanies(): Promise<HSCompany[]> {
    logger.info('Fetching all companies from HubSpot');
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
        csOwnerId: p[HUBSPOT_COMPANY_PROPS.csOwner] ?? null,
        churnRisk: p[HUBSPOT_COMPANY_PROPS.churnRisk] ?? null,
        createDate: p[HUBSPOT_COMPANY_PROPS.createDate] ?? null,
        rawProperties: p as Record<string, unknown>,
      })
    );
  }

  async getContacts(): Promise<HSContact[]> {
    logger.info('Fetching all contacts from HubSpot');
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
        createDate: p[HUBSPOT_CONTACT_PROPS.createDate] ?? null,
        rawProperties: p as Record<string, unknown>,
      })
    );
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

  async getEngagements(): Promise<HSEngagement[]> {
    logger.info('Fetching engagements from HubSpot');

    const results: HSEngagement[] = [];
    let after: string | undefined;

    do {
      const response = await this.http.get('/crm/v3/objects/engagements', {
        params: {
          limit: 100,
          properties: 'hs_engagement_type,hs_timestamp,hubspot_owner_id,hs_engagement_source',
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
