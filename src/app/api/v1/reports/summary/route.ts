import { NextRequest } from 'next/server';
import { withAuth, createSuccessResponse, createErrorResponse, type AuthenticatedRequest } from '@/lib/api/middleware';
import { pgQuery } from '@/lib/db/postgres';

export const GET = withAuth(async (_req: NextRequest, _auth: AuthenticatedRequest) => {
  try {
    const [clientsStats, tasksStats, alertsStats, renewalStats] = await Promise.all([
      pgQuery<{ total: string }>('SELECT COUNT(*) AS total FROM clients'),
      pgQuery<{ status: string; count: string }>(
        `SELECT status, COUNT(*) AS count FROM tasks
         WHERE status NOT IN ('done', 'cancelled') GROUP BY status`
      ),
      pgQuery<{ count: string }>('SELECT COUNT(*) AS count FROM alerts WHERE resolved = false'),
      pgQuery<{ renewal_window: string; count: string; total_mrr: string | null }>(
        `SELECT
           CASE
             WHEN renewal_date <= NOW() + INTERVAL '14 days' THEN '14d'
             WHEN renewal_date <= NOW() + INTERVAL '30 days' THEN '30d'
             WHEN renewal_date <= NOW() + INTERVAL '90 days' THEN '90d'
           END AS renewal_window,
           COUNT(*) AS count,
           SUM(mrr) AS total_mrr
         FROM clients
         WHERE renewal_date IS NOT NULL
           AND renewal_date >= NOW()
           AND renewal_date <= NOW() + INTERVAL '90 days'
         GROUP BY renewal_window`
      ),
    ]);

    return createSuccessResponse({
      data: {
        totalClients: parseInt(clientsStats.rows[0]?.total ?? '0'),
        openAlerts: parseInt(alertsStats.rows[0]?.count ?? '0'),
        tasks: Object.fromEntries(tasksStats.rows.map(r => [r.status, parseInt(r.count)])),
        renewals: Object.fromEntries(renewalStats.rows.map(r => [
          r.renewal_window, { count: parseInt(r.count), totalMrr: parseFloat(r.total_mrr ?? '0') }
        ])),
      }
    });
  } catch (error) {
    return createErrorResponse(error);
  }
});
