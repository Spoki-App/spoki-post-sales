import { NextRequest } from 'next/server';
import { withAuth, createSuccessResponse, createErrorResponse, ApiError, type AuthenticatedRequest } from '@/lib/api/middleware';
import { pgQuery } from '@/lib/db/postgres';
import { applyPortfolioClientFilter } from '@/lib/api/portfolio-client-filter';
import { formatHubspotOwnerName, resolveCsmDisplay } from '@/lib/services/industry-clients';

type ClientMetric = {
  id: string;
  name: string;
  mrr: number | null;
  engagement90d: number;
  healthScore: number | null;
  composite: number;
  csmLabel: string | null;
};

function normalize(v: number, min: number, max: number): number {
  if (max <= min) return 0.5;
  return Math.min(1, Math.max(0, (v - min) / (max - min)));
}

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx] ?? null;
}

export const GET = withAuth(async (request: NextRequest, auth: AuthenticatedRequest) => {
  try {
    const { searchParams } = new URL(request.url);
    const industry = searchParams.get('industry')?.trim();
    if (!industry) {
      throw new ApiError(400, 'Parametro industry obbligatorio (valore HubSpot industry_spoki)');
    }

    const viewAll = searchParams.get('viewAll') === 'true';
    const section = (searchParams.get('section') ?? 'all') as 'all' | 'onboarding' | 'company';

    const conditions: string[] = [`c.industry_spoki = $1`];
    const params: unknown[] = [industry];
    applyPortfolioClientFilter('c', auth.email ?? '', viewAll, section, conditions, params, 2);

    const where = `WHERE ${conditions.join(' AND ')}`;

    const res = await pgQuery<{
      id: string;
      name: string;
      mrr: string | null;
      engagement_90d: string;
      health_score: string | null;
      success_owner_id: string | null;
      cs_owner_id: string | null;
    }>(
      `SELECT
        c.id, c.name, c.mrr,
        (SELECT COUNT(*)::int FROM engagements e
         WHERE e.client_id = c.id AND e.occurred_at >= NOW() - INTERVAL '90 days') AS engagement_90d,
        (SELECT score FROM health_scores h WHERE h.client_id = c.id ORDER BY h.calculated_at DESC LIMIT 1) AS health_score,
        c.success_owner_id, c.cs_owner_id
      FROM clients c
      ${where}`,
      params
    );

    const rows = res.rows.map(r => {
      const eng = parseInt(r.engagement_90d, 10) || 0;
      const health = r.health_score != null ? parseInt(r.health_score, 10) : null;
      const mrr = r.mrr ? parseFloat(r.mrr) : null;
      const csm = resolveCsmDisplay(r.success_owner_id, r.cs_owner_id);
      return {
        id: r.id,
        name: r.name,
        mrr,
        engagement90d: eng,
        healthScore: health,
        composite: 0,
        csmLabel: csm.label ?? formatHubspotOwnerName(csm.ownerId),
      };
    });

    const engagements = rows.map(r => r.engagement90d);
    const healths = rows.map(r => r.healthScore).filter((x): x is number => x != null);
    const minE = Math.min(...engagements, 0);
    const maxE = Math.max(...engagements, 1);
    const minH = healths.length ? Math.min(...healths) : 0;
    const maxH = healths.length ? Math.max(...healths) : 100;

    const scored: ClientMetric[] = rows.map(r => {
      const ne = normalize(r.engagement90d, minE, maxE);
      const nh = r.healthScore != null ? normalize(r.healthScore, minH, maxH) : 0.5;
      const composite = Math.round(100 * (0.55 * ne + 0.45 * nh));
      return {
        id: r.id,
        name: r.name,
        mrr: r.mrr,
        engagement90d: r.engagement90d,
        healthScore: r.healthScore,
        composite,
        csmLabel: r.csmLabel,
      };
    });

    scored.sort((a, b) => b.composite - a.composite);
    const topClients = scored.slice(0, 8);

    const engSorted = [...engagements].sort((a, b) => a - b);
    const healthSorted = [...healths].sort((a, b) => a - b);

    return createSuccessResponse({
      data: {
        industry,
        sampleSize: scored.length,
        benchmark: {
          engagement90d: {
            p50: percentile(engSorted, 50),
            p75: percentile(engSorted, 75),
            min: engSorted.length ? engSorted[0] : null,
            max: engSorted.length ? engSorted[engSorted.length - 1] : null,
          },
          healthScore: {
            p50: healthSorted.length ? percentile(healthSorted, 50) : null,
            p75: healthSorted.length ? percentile(healthSorted, 75) : null,
          },
        },
        topClients,
        usageNote:
          'Punteggio composito (0–100): ~55% engagement HubSpot 90g, ~45% health score. I snapshot prodotto (Metabase) arricchiranno il modello in una versione successiva.',
      },
    });
  } catch (error) {
    return createErrorResponse(error, 'Impossibile calcolare il benchmark');
  }
});
