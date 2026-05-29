import { NextRequest } from 'next/server';
import { withAuth, createSuccessResponse, createErrorResponse } from '@/lib/api/middleware';
import { pgQuery } from '@/lib/db/postgres';

export const GET = withAuth(async () => {
  try {
    const result = await pgQuery(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status IN ('nuovo','contattato','nessuna_risposta','messaggio_wa','in_trattativa')) AS active,
        COALESCE(SUM(mrr_lost) FILTER (WHERE status IN ('nuovo','contattato','nessuna_risposta','messaggio_wa','in_trattativa')), 0) AS mrr_at_risk,
        COUNT(*) FILTER (WHERE status IN ('recuperato','rinnovato_auto')) AS recovered,
        COALESCE(SUM(mrr_lost) FILTER (WHERE status IN ('recuperato','rinnovato_auto')), 0) AS mrr_recovered,
        COUNT(*) FILTER (WHERE status = 'perso') AS lost,
        COALESCE(SUM(mrr_lost) FILTER (WHERE status = 'perso'), 0) AS mrr_lost_total
      FROM churn_records
    `);

    const row = result.rows[0] || {};
    const total = Number(row.total) || 0;
    const recovered = Number(row.recovered) || 0;

    return createSuccessResponse({
      data: {
        total,
        active: Number(row.active) || 0,
        mrrAtRisk: Math.round((Number(row.mrr_at_risk) || 0) * 100) / 100,
        recovered,
        mrrRecovered: Math.round((Number(row.mrr_recovered) || 0) * 100) / 100,
        lost: Number(row.lost) || 0,
        mrrLost: Math.round((Number(row.mrr_lost_total) || 0) * 100) / 100,
        recoveryRate: total > 0 ? Math.round((recovered / total) * 100) : 0,
      },
    });
  } catch (error) {
    return createErrorResponse(error, 'Failed to fetch churn summary');
  }
});
