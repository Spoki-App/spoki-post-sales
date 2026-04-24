import { NextRequest } from 'next/server';
import { withAuth, createSuccessResponse, createErrorResponse, type AuthenticatedRequest } from '@/lib/api/middleware';
import { pgQuery } from '@/lib/db/postgres';
import { getOwnerByEmail } from '@/lib/config/owners';
import {
  sqlContactPersonPickOrder,
  sqlContactPersonPickOrderPortfolio,
  sqlContactPersonPickWhereLinkedOrPrimary,
} from '@/lib/db/contact-person-pick-order';
import { planUsageFromRawProperties } from '@/lib/clients/plan-usage-from-raw';
import { readAccountQualityScoreFromRaw } from '@/lib/clients/account-quality-traffic';
import { getStageLabel, getStageConfig, getPipelineLabel, getTotalStages } from '@/lib/config/deal-pipelines';

const ONBOARDING_SORT_EXPR = `CASE ob.status
  WHEN '1' THEN 1 WHEN '1011192836' THEN 2 WHEN '2' THEN 3
  WHEN '2071331018' THEN 4 WHEN '3071245506' THEN 5 WHEN '1709021391' THEN 6
  WHEN '2724350144' THEN 7 WHEN '2724350145' THEN 8 WHEN '1005076483' THEN 9
  WHEN '2702656701' THEN -1 WHEN '2712273122' THEN -1 WHEN '4013788352' THEN -1
  WHEN '1004962561' THEN -1 WHEN '1004887980' THEN -1 WHEN '4524518615' THEN -1
  WHEN '4524518616' THEN -1
  ELSE 0
END`;

const SORTABLE_COLUMNS: Record<string, string> = {
  name: 'c.name',
  mrr: 'c.mrr',
  plan: 'c.plan',
  renewal: 'c.renewal_date',
  pipeline: 'ob.activated_at',
  onboarding: ONBOARDING_SORT_EXPR,
  lastContact: 'c.last_contact_date',
  support: 'c.cs_owner_id',
  owner: 'c.cs_owner_id',
  source: 'c.purchase_source',
};

const NULLABLE_SORT_COLUMNS = new Set(['mrr', 'plan', 'renewal', 'pipeline', 'onboarding', 'lastContact', 'support', 'owner', 'source']);

export const GET = withAuth(async (request: NextRequest, auth: AuthenticatedRequest) => {
  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
    const pageSize = 25;
    const offset = (page - 1) * pageSize;
    const q = searchParams.get('q') ?? '';
    const viewAll = searchParams.get('viewAll') === 'true';
    const contactContext = searchParams.get('contactContext') ?? '';
    const contactPickOrderSql =
      contactContext === 'portfolio'
        ? sqlContactPersonPickOrderPortfolio('paged.raw_properties')
        : sqlContactPersonPickOrder('paged.raw_properties');

    const sortKey = searchParams.get('sort') ?? 'name';
    const sortDir = searchParams.get('dir') === 'desc' ? 'DESC' : 'ASC';
    const sortCol = SORTABLE_COLUMNS[sortKey] ?? SORTABLE_COLUMNS.name;
    const nullsClause = NULLABLE_SORT_COLUMNS.has(sortKey) ? ' NULLS LAST' : '';
    const orderBy = `${sortCol} ${sortDir}${nullsClause}`;

    // Auto-filter by logged-in user's HubSpot owner ID across three owner fields.
    // If not in the owners map → manager/admin → sees all clients.
    const loggedInOwner = getOwnerByEmail(auth.email);
    const ownerFilter = viewAll ? null : (loggedInOwner?.id ?? null);
    const ownerSection = searchParams.get('section') ?? 'all';
    // section: 'all' | 'onboarding' | 'company'
    const owner = searchParams.get('owner') ?? '';
    const onboardingOwner = searchParams.get('onboardingOwner') ?? '';

    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (q) {
      conditions.push(`(c.name ILIKE $${idx} OR c.domain ILIKE $${idx})`);
      params.push(`%${q}%`);
      idx++;
    }
    if (owner) {
      conditions.push(`c.cs_owner_id = $${idx++}`);
      params.push(owner);
    }
    if (onboardingOwner) {
      conditions.push(`c.onboarding_owner_id = $${idx++}`);
      params.push(onboardingOwner);
    }
    // Section filter: which owner field to match against the logged-in user
    if (ownerFilter) {
      if (ownerSection === 'onboarding') {
        conditions.push(`c.onboarding_owner_id = $${idx++}`);
        params.push(ownerFilter);
      } else if (ownerSection === 'company') {
        conditions.push(`c.cs_owner_id = $${idx++}`);
        params.push(ownerFilter);
      } else {
        // 'all' for logged-in owner: show any company where they are any type of owner
        conditions.push(`(c.cs_owner_id = $${idx} OR c.onboarding_owner_id = $${idx} OR c.success_owner_id = $${idx})`);
        params.push(ownerFilter);
        idx++;
      }
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await pgQuery<{ count: string }>(
      `SELECT COUNT(*) FROM clients c ${where}`,
      params
    );
    const total = parseInt(countRes.rows[0]?.count ?? '0', 10);

    // Paginate first on bare clients (+ ticket lateral for pipeline sort), then
    // do the heavy engagement lateral only on the resulting 25 rows.
    const rows = await pgQuery<{
      id: string; hubspot_id: string; name: string; domain: string | null;
      industry: string | null; plan: string | null; mrr: string | null;
      renewal_date: string | null; cs_owner_id: string | null;
      onboarding_status: string | null; onboarding_stage: string | null;
      onboarding_stage_type: string | null; purchase_source: string | null; updated_at: string;
      last_contact_date: string | null;
      ob_hubspot_id: string | null; ob_pipeline: string | null;
      ob_status: string | null; ob_subject: string | null; ob_activated_at: string | null;
      support_count: string | null;
      st_hubspot_id: string | null; st_status: string | null; st_subject: string | null;
      last_engagement_hubspot_id: string | null; last_engagement_type: string | null; last_engagement_at: string | null; last_engagement_owner: string | null;
      last_engagement_email_from: string | null; last_engagement_email_to: string | null;
      last_engagement_call_direction: string | null; last_engagement_call_disposition: string | null; last_engagement_call_title: string | null;
      contact_first_name: string | null;
      contact_last_name: string | null;
      contact_email: string | null;
      contact_hubspot_id: string | null;
      sd_pipeline_id: string | null; sd_stage_id: string | null; sd_deal_name: string | null; sd_amount: string | null; sd_close_date: string | null; sd_stage_entered_at: string | null;
      ud_pipeline_id: string | null; ud_stage_id: string | null; ud_deal_name: string | null; ud_amount: string | null; ud_close_date: string | null; ud_stage_entered_at: string | null;
      churn_risk: string | null;
      raw_properties: unknown;
    }>(
      `WITH paged AS (
        SELECT
          c.id, c.hubspot_id, c.name, c.domain, c.industry, c.plan, c.mrr,
          c.renewal_date, c.cs_owner_id, c.onboarding_status,
          c.onboarding_stage, c.onboarding_stage_type, c.purchase_source, c.updated_at,
          c.last_contact_date, c.raw_properties, c.churn_risk,
          ob.hubspot_id AS ob_hubspot_id,
          ob.pipeline AS ob_pipeline,
          ob.status AS ob_status,
          ob.subject AS ob_subject,
          ob.activated_at AS ob_activated_at
        FROM clients c
        LEFT JOIN LATERAL (
          SELECT hubspot_id, pipeline, status, subject, activated_at FROM tickets
          WHERE client_id = c.id AND pipeline = '0'
          ORDER BY opened_at DESC LIMIT 1
        ) ob ON true
        ${where}
        ORDER BY ${orderBy}
        LIMIT ${pageSize} OFFSET ${offset}
      )
      SELECT
        paged.*,
        (SELECT COUNT(*) FROM tickets t WHERE t.client_id = paged.id AND t.closed_at IS NULL AND t.pipeline = '1249920186') AS support_count,
        st.hubspot_id AS st_hubspot_id,
        st.status AS st_status,
        st.subject AS st_subject,
        le.hubspot_id AS last_engagement_hubspot_id,
        le.type AS last_engagement_type,
        le.occurred_at AS last_engagement_at,
        le.owner_id AS last_engagement_owner,
        (le.raw_properties::jsonb->>'hs_email_from_firstname') || ' ' || (le.raw_properties::jsonb->>'hs_email_from_lastname') AS last_engagement_email_from,
        (le.raw_properties::jsonb->>'hs_email_to_firstname') || ' ' || (le.raw_properties::jsonb->>'hs_email_to_lastname') AS last_engagement_email_to,
        le.raw_properties::jsonb->>'hs_call_direction' AS last_engagement_call_direction,
        le.raw_properties::jsonb->>'hs_call_disposition' AS last_engagement_call_disposition,
        le.raw_properties::jsonb->>'hs_call_title' AS last_engagement_call_title,
        cp.first_name AS contact_first_name,
        cp.last_name AS contact_last_name,
        cp.email AS contact_email,
        cp.hubspot_id AS contact_hubspot_id,
        sd.pipeline_id AS sd_pipeline_id, sd.stage_id AS sd_stage_id, sd.deal_name AS sd_deal_name, sd.amount::text AS sd_amount, sd.close_date::text AS sd_close_date, sd.stage_entered_at::text AS sd_stage_entered_at,
        ud.pipeline_id AS ud_pipeline_id, ud.stage_id AS ud_stage_id, ud.deal_name AS ud_deal_name, ud.amount::text AS ud_amount, ud.close_date::text AS ud_close_date, ud.stage_entered_at::text AS ud_stage_entered_at
      FROM paged
      LEFT JOIN LATERAL (
        SELECT hubspot_id, status, subject FROM tickets
        WHERE client_id = paged.id AND closed_at IS NULL AND pipeline = '1249920186'
        ORDER BY opened_at DESC LIMIT 1
      ) st ON true
      LEFT JOIN LATERAL (
        SELECT e.hubspot_id, e.type, e.occurred_at, e.owner_id, e.raw_properties
        FROM engagements e
        WHERE e.type IN ('CALL', 'EMAIL', 'MEETING', 'INCOMING_EMAIL')
          AND (e.client_id = paged.id OR e.contact_id IN (
            SELECT co.id FROM contacts co WHERE co.client_id = paged.id
          ))
        ORDER BY e.occurred_at DESC LIMIT 1
      ) le ON true
      LEFT JOIN LATERAL (
        SELECT first_name, last_name, email, hubspot_id
        FROM contacts
        WHERE ${sqlContactPersonPickWhereLinkedOrPrimary('paged.id', 'paged.raw_properties')}
        ${contactPickOrderSql}
        LIMIT 1
      ) cp ON true
      LEFT JOIN LATERAL (
        SELECT pipeline_id, stage_id, deal_name, amount, close_date, stage_entered_at
        FROM deals WHERE client_id = paged.id AND pipeline_id = '671838099'
        ORDER BY updated_at DESC LIMIT 1
      ) sd ON true
      LEFT JOIN LATERAL (
        SELECT pipeline_id, stage_id, deal_name, amount, close_date, stage_entered_at
        FROM deals WHERE client_id = paged.id AND pipeline_id = '2683002088'
        ORDER BY updated_at DESC LIMIT 1
      ) ud ON true`,
      params
    );

    const data = rows.rows.map(r => ({
      id: r.id,
      hubspotId: r.hubspot_id,
      name: r.name,
      domain: r.domain,
      industry: r.industry,
      plan: r.plan,
      mrr: r.mrr ? parseFloat(r.mrr) : null,
      renewalDate: r.renewal_date,
      csOwnerId: r.cs_owner_id,
      onboardingStatus: r.onboarding_status,
      onboardingStage: r.onboarding_stage,
      onboardingStageType: r.onboarding_stage_type,
      churnRisk: r.churn_risk,
      purchaseSource: r.purchase_source,
      updatedAt: r.updated_at,
      onboardingTicket: r.ob_hubspot_id ? {
        hubspotId: r.ob_hubspot_id,
        pipeline: r.ob_pipeline,
        status: r.ob_status,
        subject: r.ob_subject,
        activatedAt: r.ob_activated_at,
      } : null,
      supportTicketsCount: parseInt(r.support_count ?? '0'),
      latestSupportTicket: r.st_hubspot_id ? {
        hubspotId: r.st_hubspot_id,
        status: r.st_status,
        subject: r.st_subject,
      } : null,
      lastContactDate: r.last_contact_date,
      lastEngagement: r.last_engagement_at ? {
        hubspotId: r.last_engagement_hubspot_id,
        type: r.last_engagement_type,
        occurredAt: r.last_engagement_at,
        ownerId: r.last_engagement_owner,
        emailFrom: r.last_engagement_email_from?.trim() || null,
        emailTo: r.last_engagement_email_to?.trim() || null,
        callDirection: r.last_engagement_call_direction || null,
        callDisposition: r.last_engagement_call_disposition || null,
        callTitle: r.last_engagement_call_title || null,
      } : null,
      contactPerson: r.contact_hubspot_id
        ? {
            firstName: r.contact_first_name,
            lastName: r.contact_last_name,
            email: r.contact_email,
            hubspotId: r.contact_hubspot_id,
          }
        : null,
      planUsage: planUsageFromRawProperties(r.raw_properties),
      accountQualityScore: readAccountQualityScoreFromRaw(r.raw_properties),
      salesDeal: r.sd_pipeline_id ? (() => {
        const cfg = getStageConfig(r.sd_pipeline_id!, r.sd_stage_id!);
        const daysInStage = r.sd_stage_entered_at ? Math.floor((Date.now() - new Date(r.sd_stage_entered_at).getTime()) / 86_400_000) : null;
        return {
          pipelineId: r.sd_pipeline_id!, pipelineLabel: getPipelineLabel(r.sd_pipeline_id!),
          stageLabel: getStageLabel(r.sd_pipeline_id!, r.sd_stage_id!), stageOrder: cfg?.displayOrder ?? 0,
          totalStages: getTotalStages(r.sd_pipeline_id!), isClosed: cfg?.isClosed ?? false, isWon: cfg?.isWon ?? false,
          dealName: r.sd_deal_name, amount: r.sd_amount ? parseFloat(r.sd_amount) : null,
          closeDate: r.sd_close_date, daysInStage,
        };
      })() : null,
      upsellingDeal: r.ud_pipeline_id ? (() => {
        const cfg = getStageConfig(r.ud_pipeline_id!, r.ud_stage_id!);
        const daysInStage = r.ud_stage_entered_at ? Math.floor((Date.now() - new Date(r.ud_stage_entered_at).getTime()) / 86_400_000) : null;
        return {
          pipelineId: r.ud_pipeline_id!, pipelineLabel: getPipelineLabel(r.ud_pipeline_id!),
          stageLabel: getStageLabel(r.ud_pipeline_id!, r.ud_stage_id!), stageOrder: cfg?.displayOrder ?? 0,
          totalStages: getTotalStages(r.ud_pipeline_id!), isClosed: cfg?.isClosed ?? false, isWon: cfg?.isWon ?? false,
          dealName: r.ud_deal_name, amount: r.ud_amount ? parseFloat(r.ud_amount) : null,
          closeDate: r.ud_close_date, daysInStage,
        };
      })() : null,
    }));

    return createSuccessResponse({ data, total, page, pageSize });
  } catch (error) {
    return createErrorResponse(error);
  }
});
