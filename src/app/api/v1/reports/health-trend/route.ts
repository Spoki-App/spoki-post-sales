import { NextRequest } from 'next/server';
import { withAuth, createSuccessResponse, createErrorResponse, type AuthenticatedRequest } from '@/lib/api/middleware';
import { pgQuery } from '@/lib/db/postgres';

export const GET = withAuth(async (request: NextRequest, _auth: AuthenticatedRequest) => {
  try {
    const { searchParams } = new URL(request.url);
    const days = Math.min(90, Math.max(7, parseInt(searchParams.get('days') ?? '30', 10)));

    const res = await pgQuery<{ date: string; green: string; yellow: string; red: string; avg_score: string }>(
      `SELECT
         DATE(calculated_at) AS date,
         COUNT(*) FILTER (WHERE status = 'green') AS green,
         COUNT(*) FILTER (WHERE status = 'yellow') AS yellow,
         COUNT(*) FILTER (WHERE status = 'red') AS red,
         ROUND(AVG(score), 1) AS avg_score
       FROM (
         SELECT DISTINCT ON (client_id, DATE(calculated_at))
           client_id, status, score, calculated_at
         FROM health_scores
         WHERE calculated_at >= NOW() - INTERVAL '${days} days'
         ORDER BY client_id, DATE(calculated_at), calculated_at DESC
       ) daily
       GROUP BY DATE(calculated_at)
       ORDER BY date ASC`
    );

    return createSuccessResponse({
      data: res.rows.map(r => ({
        date: r.date,
        green: parseInt(r.green),
        yellow: parseInt(r.yellow),
        red: parseInt(r.red),
        avgScore: parseFloat(r.avg_score),
      }))
    });
  } catch (error) {
    return createErrorResponse(error);
  }
});
