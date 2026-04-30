import { NextRequest } from 'next/server';
import { withAuth, createSuccessResponse, createErrorResponse, type AuthenticatedRequest } from '@/lib/api/middleware';
import { pgQuery } from '@/lib/db/postgres';
import { applyPortfolioClientFilter } from '@/lib/api/portfolio-client-filter';

export const GET = withAuth(async (request: NextRequest, auth: AuthenticatedRequest) => {
  try {
    const { searchParams } = new URL(request.url);
    const viewAll = searchParams.get('viewAll') === 'true';
    const section = (searchParams.get('section') ?? 'all') as 'all' | 'onboarding' | 'company';

    const conditions: string[] = [];
    const params: unknown[] = [];
    applyPortfolioClientFilter('c', auth.email ?? '', viewAll, section, conditions, params, 1);
    const baseWhere = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const indConditions = [
      ...conditions,
      'c.industry_spoki IS NOT NULL',
      "btrim(c.industry_spoki) <> ''",
    ];
    const indWhere = `WHERE ${indConditions.join(' AND ')}`;

    const [clientsR, indR, useC, caseC, qbrC] = await Promise.all([
      pgQuery<{ n: string }>(`SELECT COUNT(*)::text AS n FROM clients c ${baseWhere}`, params),
      pgQuery<{ n: string }>(`SELECT COUNT(DISTINCT c.industry_spoki)::text AS n FROM clients c ${indWhere}`, params),
      pgQuery<{ n: string }>(`SELECT COUNT(*)::text AS n FROM marketing_content_items WHERE content_type = 'use_case'`),
      pgQuery<{ n: string }>(`SELECT COUNT(*)::text AS n FROM marketing_content_items WHERE content_type = 'case_study'`),
      pgQuery<{ n: string }>(`SELECT COUNT(*)::text AS n FROM qbr_industry_drafts`),
    ]);

    return createSuccessResponse({
      data: {
        totalClients: parseInt(clientsR.rows[0]?.n ?? '0', 10),
        activeIndustries: parseInt(indR.rows[0]?.n ?? '0', 10),
        useCaseCount: parseInt(useC.rows[0]?.n ?? '0', 10),
        caseStudyCount: parseInt(caseC.rows[0]?.n ?? '0', 10),
        qbrGeneratedCount: parseInt(qbrC.rows[0]?.n ?? '0', 10),
      },
    });
  } catch (error) {
    return createErrorResponse(error, 'Impossibile caricare le statistiche Industries');
  }
});
