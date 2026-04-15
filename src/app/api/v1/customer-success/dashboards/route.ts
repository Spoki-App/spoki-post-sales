import { NextRequest } from 'next/server';
import {
  withAuth,
  createSuccessResponse,
  createErrorResponse,
  type AuthenticatedRequest,
} from '@/lib/api/middleware';
import { pgQuery } from '@/lib/db/postgres';
import { requireCsOwner } from '@/lib/customer-success/require-cs-owner';
import { CS_PIPELINE_STAGES } from '@/lib/config/cs-pipeline';
import { CS_HUBSPOT_DASHBOARD_EMBED } from '@/lib/config/cs-hubspot-dashboards';

export const GET = withAuth(async (_req: NextRequest, auth: AuthenticatedRequest) => {
  try {
    const owner = requireCsOwner(auth);

    const [portfolio, renewalStats, stageAgg, eligibleToAdd] = await Promise.all([
      pgQuery<{ total: string; mrr: string | null }>(
        `SELECT COUNT(*)::text AS total, SUM(mrr::numeric)::text AS mrr
         FROM clients WHERE cs_owner_id = $1`,
        [owner.id]
      ),
      pgQuery<{ renewal_window: string; count: string; total_mrr: string | null }>(
        `SELECT
           CASE
             WHEN renewal_date <= NOW() + INTERVAL '14 days' THEN '14d'
             WHEN renewal_date <= NOW() + INTERVAL '30 days' THEN '30d'
             WHEN renewal_date <= NOW() + INTERVAL '90 days' THEN '90d'
           END AS renewal_window,
           COUNT(*)::text AS count,
           SUM(mrr)::text AS total_mrr
         FROM clients
         WHERE cs_owner_id = $1
           AND renewal_date IS NOT NULL
           AND renewal_date >= NOW()
           AND renewal_date <= NOW() + INTERVAL '90 days'
         GROUP BY renewal_window`,
        [owner.id]
      ),
      pgQuery<{ stage: string; count: string }>(
        `SELECT COALESCE(p.stage, 'welcome_call') AS stage, COUNT(*)::text AS count
         FROM clients c
         LEFT JOIN cs_success_pipeline p ON p.client_id = c.id AND p.owner_hubspot_id = $1
         WHERE c.cs_owner_id = $1
         GROUP BY COALESCE(p.stage, 'welcome_call')`,
        [owner.id]
      ),
      pgQuery<{ n: string }>(
        `SELECT COUNT(*)::text AS n
         FROM clients c
         WHERE c.cs_owner_id = $1
           AND NOT EXISTS (SELECT 1 FROM cs_success_pipeline p WHERE p.client_id = c.id)`,
        [owner.id]
      ),
    ]);

    const pRow = portfolio.rows[0];
    const clientCount = parseInt(pRow?.total ?? '0', 10);
    const totalMrr = parseFloat(pRow?.mrr ?? '0') || 0;

    const renewals = Object.fromEntries(
      renewalStats.rows.map(r => [
        r.renewal_window,
        { count: parseInt(r.count, 10), totalMrr: parseFloat(r.total_mrr ?? '0') || 0 },
      ])
    ) as Record<string, { count: number; totalMrr: number }>;

    const stageCounts = new Map(stageAgg.rows.map(r => [r.stage, parseInt(r.count, 10)]));
    const completed = stageCounts.get('completed') ?? 0;
    const inPipeline = Math.max(0, clientCount - completed);
    const pipelineByStage = CS_PIPELINE_STAGES.map(s => ({
      stage: s.id,
      label: s.label,
      count: stageCounts.get(s.id) ?? 0,
    }));

    const eligibleToAddCount = parseInt(eligibleToAdd.rows[0]?.n ?? '0', 10);

    const hubspotDashboard = CS_HUBSPOT_DASHBOARD_EMBED[owner.id] ?? null;

    return createSuccessResponse({
      data: {
        owner: { id: owner.id, name: `${owner.firstName} ${owner.lastName}` },
        portfolio: { clientCount, totalMrr },
        renewals,
        pipeline: {
          inPipeline,
          completed,
          totalInCsFlow: clientCount,
          eligibleToAddCount,
          byStage: pipelineByStage,
        },
        hubspotDashboard,
      },
    });
  } catch (error) {
    return createErrorResponse(error);
  }
});
