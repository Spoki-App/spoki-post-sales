import { NextRequest } from 'next/server';
import { withAuth, createSuccessResponse, createErrorResponse, ApiError } from '@/lib/api/middleware';
import { pgQuery } from '@/lib/db/postgres';
import { chat } from '@/lib/services/gemini';

async function buildContext(): Promise<string> {
  const stats = await pgQuery<{ total: string; with_support: string; renewing_30: string }>(
    `SELECT
      (SELECT COUNT(*) FROM clients) as total,
      (SELECT COUNT(*) FROM tickets WHERE closed_at IS NULL AND pipeline = '1249920186') as with_support,
      (SELECT COUNT(*) FROM clients WHERE renewal_date BETWEEN NOW() AND NOW() + INTERVAL '30 days') as renewing_30`
  );

  const topRisk = await pgQuery<{
    name: string; plan: string | null; renewal_date: string | null;
    onboarding_stage: string | null; open_tickets: string;
  }>(
    `SELECT c.name, c.plan, c.renewal_date, c.onboarding_stage,
      (SELECT COUNT(*) FROM tickets t WHERE t.client_id = c.id AND t.closed_at IS NULL AND t.pipeline = '1249920186') as open_tickets
    FROM clients c
    WHERE c.renewal_date BETWEEN NOW() AND NOW() + INTERVAL '60 days'
    ORDER BY c.renewal_date ASC
    LIMIT 10`
  );

  const recentEngagements = await pgQuery<{ name: string; type: string; occurred_at: string }>(
    `SELECT c.name, e.type, e.occurred_at
    FROM engagements e
    JOIN clients c ON e.client_id = c.id
    WHERE e.type IN ('CALL', 'EMAIL', 'MEETING')
    ORDER BY e.occurred_at DESC LIMIT 15`
  );

  const noContact = await pgQuery<{ name: string; plan: string | null; renewal_date: string | null }>(
    `SELECT c.name, c.plan, c.renewal_date FROM clients c
    WHERE NOT EXISTS (
      SELECT 1 FROM engagements e
      LEFT JOIN contacts co ON e.contact_id = co.id
      WHERE (e.client_id = c.id OR co.client_id = c.id)
        AND e.type IN ('CALL','EMAIL','MEETING','INCOMING_EMAIL')
        AND e.occurred_at > NOW() - INTERVAL '30 days'
    )
    ORDER BY c.renewal_date ASC NULLS LAST
    LIMIT 10`
  );

  const s = stats.rows[0];
  const lines = [
    `STATISTICHE GENERALI:`,
    `- Clienti totali: ${s.total}`,
    `- Ticket supporto aperti: ${s.with_support}`,
    `- Rinnovi nei prossimi 30 giorni: ${s.renewing_30}`,
    ``,
    `CLIENTI CON RINNOVO IMMINENTE (prossimi 60 giorni):`,
    ...topRisk.rows.map(r => `- ${r.name} | piano: ${r.plan ?? 'N/D'} | rinnovo: ${r.renewal_date ?? 'N/D'} | onboarding: ${r.onboarding_stage ?? 'N/D'} | ticket aperti: ${r.open_tickets}`),
    ``,
    `CLIENTI SENZA CONTATTO NEGLI ULTIMI 30 GIORNI:`,
    ...noContact.rows.map(r => `- ${r.name} | piano: ${r.plan ?? 'N/D'} | rinnovo: ${r.renewal_date ?? 'N/D'}`),
    ``,
    `ENGAGEMENT RECENTI:`,
    ...recentEngagements.rows.map(r => `- ${r.name}: ${r.type} il ${r.occurred_at}`),
  ];

  return lines.join('\n');
}

export const POST = withAuth(async (request: NextRequest) => {
  try {
    const body = await request.json() as {
      message?: string;
      history?: Array<{ role: 'user' | 'assistant'; content: string }>;
    };

    if (!body.message) throw new ApiError(400, 'Missing message');

    const context = await buildContext();
    const response = await chat(body.message, context, body.history ?? []);

    return createSuccessResponse({ data: { message: response } });
  } catch (error) {
    return createErrorResponse(error, 'Chat failed');
  }
});
