import { NextRequest } from 'next/server';
import { withAuth, createSuccessResponse, createErrorResponse } from '@/lib/api/middleware';
import { pgQuery } from '@/lib/db/postgres';

export const GET = withAuth(async (request: NextRequest) => {
  try {
    const { searchParams } = new URL(request.url);
    const industry = searchParams.get('industry')?.trim();
    const type = searchParams.get('type')?.trim();

    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (industry) {
      conditions.push(`m.industry_spoki_match = $${idx++}`);
      params.push(industry);
    }
    if (type === 'use_case' || type === 'case_study') {
      conditions.push(`m.content_type = $${idx++}`);
      params.push(type);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const res = await pgQuery<{
      id: string;
      content_type: string;
      source_url: string;
      title: string;
      summary: string | null;
      industry_spoki_match: string | null;
      metadata: unknown;
      fetched_at: string;
    }>(
      `SELECT id, content_type, source_url, title, summary, industry_spoki_match, metadata, fetched_at
       FROM marketing_content_items m
       ${where}
       ORDER BY m.title ASC
       LIMIT 500`,
      params
    );

    return createSuccessResponse({
      data: {
        items: res.rows.map(r => ({
          id: r.id,
          contentType: r.content_type as 'use_case' | 'case_study',
          sourceUrl: r.source_url,
          title: r.title,
          summary: r.summary,
          industrySpokiMatch: r.industry_spoki_match,
          metadata: r.metadata,
          fetchedAt: r.fetched_at,
        })),
      },
    });
  } catch (error) {
    return createErrorResponse(error, 'Impossibile caricare la libreria contenuti');
  }
});
