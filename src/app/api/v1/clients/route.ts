import { NextRequest } from 'next/server';
import { withAuth, createSuccessResponse, createErrorResponse, type AuthenticatedRequest } from '@/lib/api/middleware';
import { pgQuery } from '@/lib/db/postgres';

export const GET = withAuth(async (request: NextRequest, _auth: AuthenticatedRequest) => {
  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
    const pageSize = 25;
    const offset = (page - 1) * pageSize;
    const q = searchParams.get('q') ?? '';
    const status = searchParams.get('status') ?? '';
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

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Filter by health status is done post-join
    const healthFilter = status ? `WHERE hs.status = '${status}'` : '';

    const countRes = await pgQuery<{ count: string }>(
      `SELECT COUNT(*) FROM clients c ${where}`,
      params
    );
    const total = parseInt(countRes.rows[0]?.count ?? '0', 10);

    const rows = await pgQuery<{
      id: string; hubspot_id: string; name: string; domain: string | null;
      industry: string | null; plan: string | null; mrr: string | null;
      renewal_date: string | null; cs_owner_id: string | null;
      onboarding_status: string | null; updated_at: string;
      health_score: string | null; health_status: string | null;
      open_tickets: string | null; last_contact_date: string | null;
    }>(
      `SELECT
        c.id, c.hubspot_id, c.name, c.domain, c.industry, c.plan, c.mrr,
        c.renewal_date, c.cs_owner_id, c.onboarding_status, c.updated_at,
        hs.score AS health_score,
        hs.status AS health_status,
        (SELECT COUNT(*) FROM tickets t WHERE t.client_id = c.id AND t.closed_at IS NULL) AS open_tickets,
        (SELECT MAX(e.occurred_at) FROM engagements e WHERE e.client_id = c.id) AS last_contact_date
      FROM clients c
      LEFT JOIN LATERAL (
        SELECT score, status FROM health_scores
        WHERE client_id = c.id
        ORDER BY calculated_at DESC LIMIT 1
      ) hs ON true
      ${where}
      ${healthFilter ? `HAVING hs.status = '${status}'` : ''}
      ORDER BY hs.score ASC NULLS LAST, c.name ASC
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
      updatedAt: r.updated_at,
      healthScore: r.health_score ? {
        score: parseInt(r.health_score),
        status: r.health_status as 'green' | 'yellow' | 'red',
      } : null,
      openTicketsCount: parseInt(r.open_tickets ?? '0'),
      lastContactDate: r.last_contact_date,
    }));

    return createSuccessResponse({ data, total, page, pageSize });
  } catch (error) {
    return createErrorResponse(error);
  }
});
