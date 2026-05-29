import { NextRequest } from 'next/server';
import { withAuth, createSuccessResponse, createErrorResponse } from '@/lib/api/middleware';
import { pgQuery } from '@/lib/db/postgres';
import { analyzePortfolio } from '@/lib/services/gemini';

export const POST = withAuth(async (_req: NextRequest) => {
  try {
    const statsRes = await pgQuery<{ total: string; total_mrr: string; support_tickets: string }>(
      `SELECT
        (SELECT COUNT(*) FROM clients) as total,
        (SELECT COALESCE(SUM(mrr), 0) FROM clients) as total_mrr,
        (SELECT COUNT(*) FROM tickets WHERE closed_at IS NULL AND pipeline = '1249920186') as support_tickets`
    );
    const stats = statsRes.rows[0];

    const renewingRes = await pgQuery<{ name: string; plan: string | null; mrr: string | null; renewal_date: string }>(
      `SELECT name, plan, mrr, renewal_date FROM clients
       WHERE renewal_date BETWEEN NOW() AND NOW() + INTERVAL '30 days'
       ORDER BY renewal_date ASC LIMIT 15`
    );

    const noContactRes = await pgQuery<{ name: string; plan: string | null }>(
      `SELECT c.name, c.plan FROM clients c
       WHERE NOT EXISTS (
         SELECT 1 FROM engagements e LEFT JOIN contacts co ON e.contact_id = co.id
         WHERE (e.client_id = c.id OR co.client_id = c.id)
           AND e.type IN ('CALL','EMAIL','MEETING','INCOMING_EMAIL')
           AND e.occurred_at > NOW() - INTERVAL '30 days'
       )
       LIMIT 15`
    );

    const avgPipelineRes = await pgQuery<{ avg_days: string | null }>(
      `SELECT AVG(EXTRACT(EPOCH FROM (NOW() - activated_at)) / 86400)::int as avg_days
       FROM tickets WHERE pipeline = '0' AND activated_at IS NOT NULL`
    );

    const onboardingRes = await pgQuery<{ stage: string; count: string }>(
      `SELECT COALESCE(onboarding_stage, 'Non assegnato') as stage, COUNT(*) as count
       FROM clients GROUP BY onboarding_stage ORDER BY count DESC`
    );

    const onboardingBreakdown: Record<string, number> = {};
    for (const r of onboardingRes.rows) {
      onboardingBreakdown[r.stage] = parseInt(r.count);
    }

    const insights = await analyzePortfolio({
      totalClients: parseInt(stats.total),
      totalMrr: parseFloat(stats.total_mrr),
      renewingNext30: renewingRes.rows.map(r => ({
        name: r.name,
        plan: r.plan,
        mrr: r.mrr ? parseFloat(r.mrr) : null,
        renewalDate: r.renewal_date,
      })),
      noContactLast30: noContactRes.rows,
      openSupportTickets: parseInt(stats.support_tickets),
      avgDaysInPipeline: avgPipelineRes.rows[0]?.avg_days ? parseInt(avgPipelineRes.rows[0].avg_days) : null,
      onboardingBreakdown,
    });

    return createSuccessResponse({ data: insights });
  } catch (error) {
    return createErrorResponse(error, 'Failed to generate portfolio insights');
  }
});
