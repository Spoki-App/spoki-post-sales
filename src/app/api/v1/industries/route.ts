import { NextRequest } from 'next/server';
import { withAuth, createSuccessResponse, createErrorResponse, type AuthenticatedRequest } from '@/lib/api/middleware';
import { pgQuery } from '@/lib/db/postgres';
import { applyPortfolioClientFilter } from '@/lib/api/portfolio-client-filter';
import { industryGroupLabel } from '@/lib/services/industry-clients';

export const GET = withAuth(async (request: NextRequest, auth: AuthenticatedRequest) => {
  try {
    const { searchParams } = new URL(request.url);
    const viewAll = searchParams.get('viewAll') === 'true';
    const section = (searchParams.get('section') ?? 'all') as 'all' | 'onboarding' | 'company';

    const conditions: string[] = [];
    const params: unknown[] = [];
    applyPortfolioClientFilter('c', auth.email ?? '', viewAll, section, conditions, params, 1);

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const rows = await pgQuery<{ industry_spoki: string | null; client_count: string }>(
      `SELECT c.industry_spoki, COUNT(*)::text AS client_count
       FROM clients c
       ${where}
       GROUP BY c.industry_spoki
       ORDER BY COUNT(*) DESC, c.industry_spoki ASC NULLS FIRST`,
      params
    );

    const industries = rows.rows.map(r => ({
      key: r.industry_spoki,
      label: industryGroupLabel(r.industry_spoki),
      clientCount: parseInt(r.client_count, 10),
    }));

    return createSuccessResponse({ data: { industries } });
  } catch (error) {
    return createErrorResponse(error, 'Impossibile caricare le industry');
  }
});
