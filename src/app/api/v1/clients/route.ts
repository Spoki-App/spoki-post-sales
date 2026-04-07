import { NextRequest } from 'next/server';
import { withAuth, createSuccessResponse, createErrorResponse, type AuthenticatedRequest } from '@/lib/api/middleware';
import { pgQuery } from '@/lib/db/postgres';
import { getOwnerByEmail } from '@/lib/config/owners';

export const GET = withAuth(async (request: NextRequest, auth: AuthenticatedRequest) => {
  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
    const pageSize = 25;
    const offset = (page - 1) * pageSize;
    const q = searchParams.get('q') ?? '';
    const viewAll = searchParams.get('viewAll') === 'true';

    // Auto-filter by logged-in user's HubSpot owner ID across three owner fields.
    // If not in the owners map → manager/admin → sees all clients.
    const loggedInOwner = getOwnerByEmail(auth.email);
    const ownerFilter = viewAll ? null : (loggedInOwner?.id ?? null);
    const ownerSection = searchParams.get('section') ?? 'all';
    // section: 'all' | 'onboarding' | 'success' | 'company'
    const owner = searchParams.get('owner') ?? '';

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
    // Section filter: which owner field to match against the logged-in user
    if (ownerFilter) {
      if (ownerSection === 'onboarding') {
        conditions.push(`c.onboarding_owner_id = $${idx++}`);
        params.push(ownerFilter);
      } else if (ownerSection === 'success') {
        conditions.push(`c.success_owner_id = $${idx++}`);
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

    const rows = await pgQuery<{
      id: string; hubspot_id: string; name: string; domain: string | null;
      industry: string | null; plan: string | null; mrr: string | null;
      renewal_date: string | null; cs_owner_id: string | null;
      onboarding_status: string | null; onboarding_stage: string | null;
      onboarding_stage_type: string | null; updated_at: string;
      last_contact_date: string | null;
      ob_hubspot_id: string | null; ob_pipeline: string | null;
      ob_status: string | null; ob_subject: string | null;
      support_count: string | null;
      st_hubspot_id: string | null; st_status: string | null; st_subject: string | null;
      last_engagement_hubspot_id: string | null; last_engagement_type: string | null; last_engagement_at: string | null; last_engagement_owner: string | null;
      last_engagement_email_from: string | null; last_engagement_email_to: string | null;
      last_engagement_call_direction: string | null; last_engagement_call_disposition: string | null; last_engagement_call_title: string | null;
    }>(
      `SELECT
        c.id, c.hubspot_id, c.name, c.domain, c.industry, c.plan, c.mrr,
        c.renewal_date, c.cs_owner_id, c.onboarding_status,
        c.onboarding_stage, c.onboarding_stage_type, c.updated_at,
        c.last_contact_date,
        ob.hubspot_id AS ob_hubspot_id,
        ob.pipeline AS ob_pipeline,
        ob.status AS ob_status,
        ob.subject AS ob_subject,
        (SELECT COUNT(*) FROM tickets t WHERE t.client_id = c.id AND t.closed_at IS NULL AND t.pipeline = '1249920186') AS support_count,
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
        le.raw_properties::jsonb->>'hs_call_title' AS last_engagement_call_title
      FROM clients c
      LEFT JOIN LATERAL (
        SELECT hubspot_id, pipeline, status, subject FROM tickets
        WHERE client_id = c.id AND pipeline = '0'
        ORDER BY opened_at DESC LIMIT 1
      ) ob ON true
      LEFT JOIN LATERAL (
        SELECT hubspot_id, status, subject FROM tickets
        WHERE client_id = c.id AND closed_at IS NULL AND pipeline = '1249920186'
        ORDER BY opened_at DESC LIMIT 1
      ) st ON true
      LEFT JOIN LATERAL (
        SELECT e.hubspot_id, e.type, e.occurred_at, e.owner_id, e.raw_properties FROM engagements e
        WHERE e.type IN ('CALL', 'EMAIL', 'MEETING', 'INCOMING_EMAIL')
          AND (e.client_id = c.id OR e.contact_id IN (SELECT co.id FROM contacts co WHERE co.client_id = c.id))
        ORDER BY e.occurred_at DESC LIMIT 1
      ) le ON true
      ${where}
      ORDER BY c.name ASC
      LIMIT ${pageSize} OFFSET ${offset}`,
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
      updatedAt: r.updated_at,
      onboardingTicket: r.ob_hubspot_id ? {
        hubspotId: r.ob_hubspot_id,
        pipeline: r.ob_pipeline,
        status: r.ob_status,
        subject: r.ob_subject,
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
    }));

    return createSuccessResponse({ data, total, page, pageSize });
  } catch (error) {
    return createErrorResponse(error);
  }
});
