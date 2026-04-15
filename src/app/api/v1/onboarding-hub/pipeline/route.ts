import { NextRequest } from 'next/server';
import { withAuth, createSuccessResponse, createErrorResponse } from '@/lib/api/middleware';
import { pgQuery } from '@/lib/db/postgres';
import { requireOnboardingOwner } from '@/lib/onboarding/require-onboarding-owner';
import { ONBOARDING_PIPELINE_ID } from '@/lib/config/onboarding-pipeline';
import { isAdminEmail } from '@/lib/config/owners';

export const GET = withAuth(async (_request: NextRequest, auth) => {
  try {
    const owner = requireOnboardingOwner(auth);
    const isAdmin = isAdminEmail(auth.email);
    const ownerCondition = isAdmin ? '' : 'AND c.onboarding_owner_id = $1';
    const ownerParams = isAdmin ? [] : [owner.id];

    const rows = await pgQuery<{
      id: string;
      hubspot_id: string;
      name: string;
      domain: string | null;
      mrr: string | null;
      plan: string | null;
      onboarding_stage: string | null;
      activated_at: string | null;
      opened_at: string | null;
    }>(
      `SELECT
        c.id, c.hubspot_id, c.name, c.domain, c.mrr, c.plan,
        t.status AS onboarding_stage,
        t.activated_at,
        t.opened_at
      FROM clients c
      JOIN LATERAL (
        SELECT status, activated_at, opened_at FROM tickets
        WHERE client_id = c.id AND pipeline = '${ONBOARDING_PIPELINE_ID}'
        ORDER BY opened_at DESC LIMIT 1
      ) t ON true
      WHERE TRUE ${ownerCondition}
      ORDER BY t.opened_at DESC`,
      ownerParams
    );

    const cards = rows.rows.map(r => ({
      clientId: r.id,
      hubspotId: r.hubspot_id,
      name: r.name,
      domain: r.domain,
      mrr: r.mrr ? parseFloat(r.mrr) : null,
      plan: r.plan,
      stage: r.onboarding_stage,
      activatedAt: r.activated_at,
      openedAt: r.opened_at,
    }));

    return createSuccessResponse({ data: { cards } });
  } catch (error) {
    return createErrorResponse(error);
  }
});
