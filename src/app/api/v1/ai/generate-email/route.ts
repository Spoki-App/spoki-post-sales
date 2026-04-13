import { NextRequest } from 'next/server';
import { withAuth, createSuccessResponse, createErrorResponse, ApiError, type AuthenticatedRequest } from '@/lib/api/middleware';
import { pgQuery } from '@/lib/db/postgres';
import { generateEmail, type EmailType } from '@/lib/services/gemini';
import { differenceInDays } from 'date-fns';

export const POST = withAuth(async (request: NextRequest, auth: AuthenticatedRequest) => {
  try {
    const body = await request.json() as {
      clientId?: string;
      type?: EmailType;
      customInstructions?: string;
    };

    if (!body.clientId || !body.type) throw new ApiError(400, 'Missing clientId or type');

    const clientRes = await pgQuery<{
      name: string; plan: string | null; renewal_date: string | null; onboarding_stage: string | null;
    }>('SELECT name, plan, renewal_date, onboarding_stage FROM clients WHERE id = $1', [body.clientId]);
    if (clientRes.rows.length === 0) throw new ApiError(404, 'Client not found');
    const client = clientRes.rows[0];

    const contactRes = await pgQuery<{ first_name: string | null; last_name: string | null }>(
      'SELECT first_name, last_name FROM contacts WHERE client_id = $1 ORDER BY last_activity_at DESC NULLS LAST LIMIT 1',
      [body.clientId]
    );
    const contact = contactRes.rows[0];
    const contactName = contact ? [contact.first_name, contact.last_name].filter(Boolean).join(' ') || null : null;

    const engRes = await pgQuery<{ type: string; occurred_at: string }>(
      `SELECT e.type, e.occurred_at FROM engagements e
       LEFT JOIN contacts co ON e.contact_id = co.id
       WHERE (e.client_id = $1 OR co.client_id = $1) AND e.type IN ('CALL','EMAIL','MEETING','INCOMING_EMAIL')
       ORDER BY e.occurred_at DESC LIMIT 1`,
      [body.clientId]
    );
    const lastEng = engRes.rows[0];

    const email = await generateEmail({
      type: body.type,
      clientName: client.name,
      contactName,
      plan: client.plan,
      renewalDate: client.renewal_date,
      onboardingStage: client.onboarding_stage,
      lastEngagementType: lastEng?.type ?? null,
      lastEngagementDaysAgo: lastEng ? differenceInDays(new Date(), new Date(lastEng.occurred_at)) : null,
      customInstructions: body.customInstructions,
      senderName: auth.name ?? auth.email ?? 'Customer Success',
    });

    return createSuccessResponse({ data: email });
  } catch (error) {
    return createErrorResponse(error, 'Failed to generate email');
  }
});
