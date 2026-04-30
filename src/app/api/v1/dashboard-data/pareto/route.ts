import { NextRequest } from 'next/server';
import { withAuth, createSuccessResponse, createErrorResponse } from '@/lib/api/middleware';
import { runNativeQuery } from '@/lib/services/metabase';
import { isConfigured } from '@/lib/config';

function currentYearMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const Q_PARETO_TREND = `
WITH account_mrr AS (
  SELECT month, account_id, SUM(mrr_amount) AS mrr
  FROM finance_mart.mrr_monthly_internal_v
  WHERE month >= '2025-01' AND month <= DATE_FORMAT(CURRENT_DATE, '%Y-%m')
    AND mrr_amount > 0
  GROUP BY month, account_id
),
ranked AS (
  SELECT *,
    ROW_NUMBER() OVER (PARTITION BY month ORDER BY mrr DESC) AS rn,
    COUNT(*) OVER (PARTITION BY month) AS n,
    SUM(mrr) OVER (PARTITION BY month) AS total
  FROM account_mrr
)
SELECT
  month,
  MAX(n) AS total_accounts,
  ROUND(MAX(total), 2) AS total_mrr,
  ROUND(CAST(SUM(CASE WHEN rn <= CEIL(n * 0.1) THEN mrr ELSE 0 END) AS DOUBLE) / MAX(total) * 100, 1) AS pct_mrr_top10,
  ROUND(CAST(SUM(CASE WHEN rn <= CEIL(n * 0.2) THEN mrr ELSE 0 END) AS DOUBLE) / MAX(total) * 100, 1) AS pct_mrr_top20,
  ROUND(CAST(SUM(CASE WHEN rn <= CEIL(n * 0.5) THEN mrr ELSE 0 END) AS DOUBLE) / MAX(total) * 100, 1) AS pct_mrr_top50
FROM ranked
GROUP BY month, n
ORDER BY month
`;

function buildTopAccountsQuery(month: string) {
  return `
WITH account_mrr AS (
  SELECT
    m.account_id, m.account_name,
    SUM(m.mrr_amount) AS mrr,
    MAX(m.plan_slug) AS plan_slug
  FROM finance_mart.mrr_monthly_internal_v m
  WHERE m.month = '${month}' AND m.mrr_amount > 0
  GROUP BY m.account_id, m.account_name
),
ranked AS (
  SELECT *,
    ROW_NUMBER() OVER (ORDER BY mrr DESC) AS rn,
    COUNT(*) OVER () AS n,
    SUM(mrr) OVER () AS total_mrr
  FROM account_mrr
)
SELECT
  rn AS rank_num, account_id, account_name,
  ROUND(mrr, 2) AS mrr, ROUND(mrr * 12, 2) AS arr,
  ROUND(CAST(mrr AS DOUBLE) / total_mrr * 100, 2) AS pct_of_total,
  plan_slug
FROM ranked
WHERE rn <= CEIL(n * 0.2)
ORDER BY rn
`;
}

function buildDistributionQuery(month: string) {
  return `
WITH account_mrr AS (
  SELECT account_id, SUM(mrr_amount) AS mrr
  FROM finance_mart.mrr_monthly_internal_v
  WHERE month = '${month}' AND mrr_amount > 0
  GROUP BY account_id
)
SELECT
  CASE
    WHEN mrr < 50 THEN '0-50'
    WHEN mrr < 100 THEN '50-100'
    WHEN mrr < 200 THEN '100-200'
    WHEN mrr < 500 THEN '200-500'
    WHEN mrr < 1000 THEN '500-1K'
    ELSE '1K+'
  END AS bucket,
  COUNT(*) AS count,
  ROUND(SUM(mrr), 2) AS total_mrr
FROM account_mrr
GROUP BY 1
ORDER BY MIN(mrr)
`;
}

function round2(v: number) {
  return Math.round((v || 0) * 100) / 100;
}

export const GET = withAuth(async (request: NextRequest) => {
  if (!isConfigured('metabase')) {
    return createSuccessResponse({ data: { summary: null, trend: [], topAccounts: [], distribution: [] } });
  }

  const url = new URL(request.url);
  const month = url.searchParams.get('month') || currentYearMonth();

  try {
    const [trendRaw, topRaw, distRaw] = await Promise.all([
      runNativeQuery<Record<string, string>>(Q_PARETO_TREND),
      runNativeQuery<Record<string, string>>(buildTopAccountsQuery(month)),
      runNativeQuery<Record<string, string>>(buildDistributionQuery(month)),
    ]);

    const trend = trendRaw.map(r => ({
      month: r.month,
      totalAccounts: parseInt(r.total_accounts) || 0,
      totalMrr: round2(parseFloat(r.total_mrr)),
      pctMrrTop10: parseFloat(r.pct_mrr_top10) || 0,
      pctMrrTop20: parseFloat(r.pct_mrr_top20) || 0,
      pctMrrTop50: parseFloat(r.pct_mrr_top50) || 0,
    }));

    const topAccounts = topRaw.map(r => ({
      rank: parseInt(r.rank_num) || 0,
      accountId: r.account_id,
      accountName: r.account_name,
      mrr: round2(parseFloat(r.mrr)),
      arr: round2(parseFloat(r.arr)),
      pctOfTotal: parseFloat(r.pct_of_total) || 0,
      planSlug: r.plan_slug,
    }));

    const distribution = distRaw.map(r => ({
      bucket: r.bucket,
      count: parseInt(r.count) || 0,
      totalMrr: round2(parseFloat(r.total_mrr)),
    }));

    const latestTrend = trend.length > 0 ? trend[trend.length - 1] : null;

    return createSuccessResponse({
      data: {
        summary: latestTrend,
        trend,
        topAccounts,
        distribution,
        selectedMonth: month,
      },
    });
  } catch (error) {
    return createErrorResponse(error, 'Failed to fetch Pareto analysis');
  }
});
