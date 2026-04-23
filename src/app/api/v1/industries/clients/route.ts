import { NextRequest } from 'next/server';
import { withAuth, createSuccessResponse, createErrorResponse, type AuthenticatedRequest } from '@/lib/api/middleware';
import { pgQuery } from '@/lib/db/postgres';
import { applyPortfolioClientFilter } from '@/lib/api/portfolio-client-filter';
import {
  industryGroupKey,
  industryGroupLabel,
  resolveCsmDisplay,
} from '@/lib/services/industry-clients';

const MAX_ROWS = 4000;

type Row = {
  id: string;
  hubspot_id: string;
  name: string;
  industry_spoki: string | null;
  plan: string | null;
  mrr: string | null;
  onboarding_status: string | null;
  churn_risk: string | null;
  last_contact_date: string | null;
  success_owner_id: string | null;
  cs_owner_id: string | null;
  health_score: string | null;
  health_status: string | null;
  engagement_90d: string;
};

export const GET = withAuth(async (request: NextRequest, auth: AuthenticatedRequest) => {
  try {
    const { searchParams } = new URL(request.url);
    const q = (searchParams.get('q') ?? '').trim();
    const viewAll = searchParams.get('viewAll') === 'true';
    const section = (searchParams.get('section') ?? 'all') as 'all' | 'onboarding' | 'company';
    const industryFilter = searchParams.get('industry')?.trim();
    const sort = searchParams.get('sort') ?? 'name';
    const dir = searchParams.get('dir') === 'desc' ? 'DESC' : 'ASC';

    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = applyPortfolioClientFilter('c', auth.email ?? '', viewAll, section, conditions, params, 1);

    if (q) {
      conditions.push(`(c.name ILIKE $${idx} OR c.domain ILIKE $${idx})`);
      params.push(`%${q}%`);
      idx++;
    }
    if (industryFilter) {
      if (industryFilter === '__none__') {
        conditions.push(`(c.industry_spoki IS NULL OR btrim(c.industry_spoki) = '')`);
      } else {
        conditions.push(`c.industry_spoki = $${idx++}`);
        params.push(industryFilter);
      }
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    let orderSql = 'name ASC';
    if (sort === 'mrr') orderSql = `mrr ${dir} NULLS LAST, name ASC`;
    else if (sort === 'engagement') orderSql = `engagement_90d ${dir} NULLS LAST, name ASC`;
    else if (sort === 'health') orderSql = `health_score ${dir} NULLS LAST, name ASC`;
    else if (sort === 'name') orderSql = `name ${dir}`;

    const res = await pgQuery<Row>(
      `WITH base AS (
        SELECT
          c.id, c.hubspot_id, c.name, c.industry_spoki, c.plan, c.mrr, c.onboarding_status, c.churn_risk, c.last_contact_date,
          c.success_owner_id, c.cs_owner_id,
          (SELECT COUNT(*)::int FROM engagements e
           WHERE e.client_id = c.id AND e.occurred_at >= NOW() - INTERVAL '90 days') AS engagement_90d,
          hs.score AS health_score,
          hs.status AS health_status
        FROM clients c
        LEFT JOIN LATERAL (
          SELECT score, status FROM health_scores h
          WHERE h.client_id = c.id ORDER BY h.calculated_at DESC LIMIT 1
        ) hs ON true
        ${where}
      )
      SELECT * FROM base
      ORDER BY ${orderSql}
      LIMIT ${MAX_ROWS + 1}`,
      params
    );

    const limited = res.rows.length > MAX_ROWS;
    const dataRows = limited ? res.rows.slice(0, MAX_ROWS) : res.rows;

    const clients = dataRows.map(r => {
      const csm = resolveCsmDisplay(r.success_owner_id, r.cs_owner_id);
      return {
        id: r.id,
        hubspotId: r.hubspot_id,
        name: r.name,
        industrySpoki: r.industry_spoki,
        plan: r.plan,
        mrr: r.mrr ? parseFloat(r.mrr) : null,
        onboardingStatus: r.onboarding_status,
        churnRisk: r.churn_risk,
        lastContactDate: r.last_contact_date,
        csm,
        health: {
          score: r.health_score != null ? parseInt(r.health_score, 10) : null,
          status: r.health_status,
        },
        engagement90d: parseInt(r.engagement_90d, 10) || 0,
      };
    });

    const byKey = new Map<string | null, typeof clients>();
    for (const cl of clients) {
      const k = industryGroupKey(cl.industrySpoki);
      if (!byKey.has(k)) byKey.set(k, []);
      byKey.get(k)!.push(cl);
    }

    const groups: Array<{
      key: string | null;
      label: string;
      clients: typeof clients;
    }> = [];

    const keysSorted = Array.from(byKey.keys()).sort((a, b) => {
      if (a === null && b === null) return 0;
      if (a === null) return 1;
      if (b === null) return -1;
      return industryGroupLabel(a).localeCompare(industryGroupLabel(b), 'it');
    });

    for (const k of keysSorted) {
      const list = byKey.get(k) ?? [];
      groups.push({ key: k, label: industryGroupLabel(k ?? undefined), clients: list });
    }

    return createSuccessResponse({
      data: {
        groups,
        totalClients: clients.length,
        limited,
        maxRows: MAX_ROWS,
      },
    });
  } catch (error) {
    return createErrorResponse(error, 'Impossibile caricare i clienti per industry');
  }
});
