import { NextRequest } from 'next/server';
import { withAuth, createSuccessResponse, createErrorResponse, ApiError, type AuthenticatedRequest, type RouteHandlerContext } from '@/lib/api/middleware';
import { pgQuery } from '@/lib/db/postgres';
import { analyzeClient } from '@/lib/services/gemini';
import { differenceInDays } from 'date-fns';

export const POST = withAuth(async (_req: NextRequest, _auth: AuthenticatedRequest, context?: RouteHandlerContext) => {
  try {
    const params = await context?.params;
    const id = params?.id as string;
    if (!id) throw new ApiError(400, 'Missing client id');

    const clientRes = await pgQuery<{
      name: string; plan: string | null; mrr: string | null;
      renewal_date: string | null; onboarding_stage: string | null;
    }>(
      'SELECT name, plan, mrr, renewal_date, onboarding_stage FROM clients WHERE id = $1', [id]
    );
    if (clientRes.rows.length === 0) throw new ApiError(404, 'Client not found');
    const client = clientRes.rows[0];

    const supportRes = await pgQuery<{ count: string }>(
      `SELECT COUNT(*) as count FROM tickets WHERE client_id = $1 AND closed_at IS NULL AND pipeline = '1249920186'`, [id]
    );

    const activatedRes = await pgQuery<{ activated_at: string | null }>(
      `SELECT activated_at FROM tickets WHERE client_id = $1 AND pipeline = '0' ORDER BY opened_at DESC LIMIT 1`, [id]
    );

    const engRes = await pgQuery<{ total: string; latest_type: string | null; latest_at: string | null }>(
      `SELECT
        (SELECT COUNT(*) FROM engagements e LEFT JOIN contacts co ON e.contact_id = co.id
         WHERE (e.client_id = $1 OR co.client_id = $1) AND e.type IN ('CALL','EMAIL','MEETING','INCOMING_EMAIL')) as total,
        le.type as latest_type, le.occurred_at as latest_at
      FROM (SELECT 1) x
      LEFT JOIN LATERAL (
        SELECT e.type, e.occurred_at FROM engagements e
        LEFT JOIN contacts co ON e.contact_id = co.id
        WHERE (e.client_id = $1 OR co.client_id = $1) AND e.type IN ('CALL','EMAIL','MEETING','INCOMING_EMAIL')
        ORDER BY e.occurred_at DESC LIMIT 1
      ) le ON true`, [id]
    );

    const contactsRes = await pgQuery<{ count: string }>(
      'SELECT COUNT(*) as count FROM contacts WHERE client_id = $1', [id]
    );

    const eng = engRes.rows[0];
    const activatedAt = activatedRes.rows[0]?.activated_at;

    const analysis = await analyzeClient({
      name: client.name,
      plan: client.plan,
      mrr: client.mrr ? parseFloat(client.mrr) : null,
      renewalDate: client.renewal_date,
      daysInPipeline: activatedAt ? differenceInDays(new Date(), new Date(activatedAt)) : null,
      onboardingStage: client.onboarding_stage,
      openSupportTickets: parseInt(supportRes.rows[0].count),
      lastEngagement: eng.latest_at ? {
        type: eng.latest_type ?? 'UNKNOWN',
        daysAgo: differenceInDays(new Date(), new Date(eng.latest_at)),
      } : null,
      totalEngagements: parseInt(eng.total),
      contactsCount: parseInt(contactsRes.rows[0].count),
    });

    return createSuccessResponse({ data: analysis });
  } catch (error) {
    return createErrorResponse(error, 'Failed to analyze client');
  }
});
