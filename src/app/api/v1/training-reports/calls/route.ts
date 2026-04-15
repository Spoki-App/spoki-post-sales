import { NextRequest } from 'next/server';
import { withAuth, createSuccessResponse, createErrorResponse, ApiError } from '@/lib/api/middleware';
import { isAdminEmail } from '@/lib/config/owners';
import { getOwnerName } from '@/lib/config/owners';
import { pgQuery } from '@/lib/db/postgres';

export const GET = withAuth(async (request: NextRequest, auth) => {
  if (!isAdminEmail(auth.email)) {
    throw new ApiError(403, 'Accesso riservato agli admin');
  }

  try {
    const { searchParams } = new URL(request.url);
    const ownerHubspotId = searchParams.get('owner') ?? '';
    const days = parseInt(searchParams.get('days') ?? '90', 10);
    const outcomeFilter = searchParams.get('outcome') ?? 'all';

    const conditions: string[] = [
      `e.type = 'MEETING'`,
      `e.raw_properties::jsonb->>'hs_meeting_title' ILIKE $1`,
      `e.occurred_at >= NOW() - INTERVAL '${days} days'`,
    ];

    if (outcomeFilter !== 'all') {
      conditions.push(`e.raw_properties::jsonb->>'hs_meeting_outcome' = '${outcomeFilter.toUpperCase()}'`);
    }
    const params: unknown[] = ['%training%'];
    let idx = 2;

    if (ownerHubspotId) {
      conditions.push(`e.owner_id = $${idx++}`);
      params.push(ownerHubspotId);
    }

    const where = conditions.join(' AND ');

    const rows = await pgQuery<{
      hubspot_id: string;
      owner_id: string | null;
      occurred_at: string;
      client_id: string | null;
      meeting_title: string | null;
      client_name: string | null;
      client_domain: string | null;
      client_hubspot_id: string | null;
      outcome: string | null;
    }>(
      `SELECT e.hubspot_id, e.owner_id, e.occurred_at, e.client_id,
        e.raw_properties::jsonb->>'hs_meeting_title' AS meeting_title,
        e.raw_properties::jsonb->>'hs_meeting_outcome' AS outcome,
        c.name AS client_name, c.domain AS client_domain,
        c.hubspot_id AS client_hubspot_id
      FROM engagements e
      LEFT JOIN clients c ON c.id = e.client_id
      WHERE ${where}
      ORDER BY e.occurred_at DESC`,
      params
    );

    const data = rows.rows.map(r => ({
      hubspotId: r.hubspot_id,
      title: r.meeting_title ?? 'Meeting',
      date: r.occurred_at,
      outcome: r.outcome ?? null,
      owner: {
        id: r.owner_id,
        name: getOwnerName(r.owner_id),
      },
      client: r.client_name ? {
        id: r.client_id,
        hubspotId: r.client_hubspot_id,
        name: r.client_name,
        domain: r.client_domain,
      } : null,
    }));

    return createSuccessResponse({ data, total: data.length });
  } catch (error) {
    return createErrorResponse(error);
  }
});