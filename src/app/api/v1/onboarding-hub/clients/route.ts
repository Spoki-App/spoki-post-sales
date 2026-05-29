import { NextRequest } from 'next/server';
import { withAuth, createSuccessResponse, createErrorResponse } from '@/lib/api/middleware';
import { pgQuery } from '@/lib/db/postgres';
import { requireOnboardingOwner } from '@/lib/onboarding/require-onboarding-owner';
import { ONBOARDING_PIPELINE_ID } from '@/lib/config/onboarding-pipeline';
import { isAdminEmail } from '@/lib/config/owners';

export const GET = withAuth(async (request: NextRequest, auth) => {
  try {
    const owner = requireOnboardingOwner(auth);
    const isAdmin = isAdminEmail(auth.email);

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
    const pageSize = 50;
    const offset = (page - 1) * pageSize;
    const q = searchParams.get('q') ?? '';

    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (!isAdmin) {
      conditions.push(`c.onboarding_owner_id = $${idx++}`);
      params.push(owner.id);
    }
    if (q) {
      conditions.push(`(c.name ILIKE $${idx} OR c.domain ILIKE $${idx})`);
      params.push(`%${q}%`);
      idx++;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await pgQuery<{ count: string }>(
      `SELECT COUNT(*) FROM clients c ${where}`,
      params
    );
    const total = parseInt(countRes.rows[0]?.count ?? '0', 10);

    const rows = await pgQuery<{
      id: string; hubspot_id: string; name: string; domain: string | null;
      mrr: string | null; plan: string | null; renewal_date: string | null;
      onboarding_stage: string | null; activated_at: string | null;
    }>(
      `SELECT
        c.id, c.hubspot_id, c.name, c.domain, c.mrr, c.plan, c.renewal_date,
        t.status AS onboarding_stage,
        t.activated_at
      FROM clients c
      LEFT JOIN LATERAL (
        SELECT status, activated_at FROM tickets
        WHERE client_id = c.id AND pipeline = '${ONBOARDING_PIPELINE_ID}'
        ORDER BY opened_at DESC LIMIT 1
      ) t ON true
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
      mrr: r.mrr ? parseFloat(r.mrr) : null,
      plan: r.plan,
      renewalDate: r.renewal_date,
      onboardingStage: r.onboarding_stage,
      activatedAt: r.activated_at,
    }));

    return createSuccessResponse({ data, total, page, pageSize });
  } catch (error) {
    return createErrorResponse(error);
  }
});
