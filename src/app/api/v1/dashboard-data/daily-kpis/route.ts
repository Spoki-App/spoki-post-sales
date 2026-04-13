import { NextRequest } from 'next/server';
import { withAuth, createSuccessResponse, createErrorResponse } from '@/lib/api/middleware';
import { runNativeQuery } from '@/lib/services/metabase';
import { isConfigured } from '@/lib/config';

const Q_SUBSCRIPTION_MRR = `
WITH cur AS (
  SELECT DATE_FORMAT(CURRENT_DATE, '%Y-%m') AS cm,
         DATE_FORMAT(DATE_ADD('month', -1, CURRENT_DATE), '%Y-%m') AS pm
),
current_month AS (
  SELECT account_id, mrr_amount
  FROM "finance-mart-prd-data-platform-db".mrr_monthly_internal_v, cur
  WHERE month = cur.cm AND mrr_amount > 0
    AND payment_type NOT IN ('Additional Package Onboarding','Agency Panel Activation',
                             'Exceeded Conversations','Other','Credit')
),
prev_only AS (
  SELECT p.account_id, p.mrr_amount
  FROM "finance-mart-prd-data-platform-db".mrr_monthly_internal_v p CROSS JOIN cur
  WHERE p.month = cur.pm AND p.mrr_amount > 0
    AND p.payment_type NOT IN ('Additional Package Onboarding','Agency Panel Activation',
                               'Exceeded Conversations','Other','Credit')
    AND NOT EXISTS (SELECT 1 FROM current_month c WHERE c.account_id = p.account_id)
    AND (p.subscription_end_date >= CURRENT_DATE - INTERVAL '30' DAY
         OR p.subscription_end_date IS NULL)
)
SELECT ROUND(SUM(mrr_amount), 2) AS total_subscription_mrr
FROM (
  SELECT account_id, mrr_amount FROM current_month
  UNION ALL
  SELECT account_id, mrr_amount FROM prev_only
)
`;

const Q_CREDIT_30D = `
SELECT ROUND(SUM(amount_without_vat), 2) AS total_credit
FROM "gold-prd-data-platform-db".payment_lines_current
WHERE payment_type = 'Credit'
  AND payment_date >= CURRENT_DATE - INTERVAL '30' DAY
`;

const Q_MONTHLY_REVENUE = `
SELECT
  DATE_FORMAT(p.payment_date, '%Y-%m') AS month,
  COALESCE(SUM(p.amount_without_vat), 0) AS total
FROM "gold-prd-data-platform-db".payment_lines_current p
WHERE p.payment_date >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1' MONTH)
  AND p.is_refund = false
GROUP BY 1
ORDER BY 1
`;

const Q_DAILY_REVENUE = `
SELECT
  DATE_FORMAT(payment_date, '%Y-%m-%d') AS day,
  COALESCE(SUM(amount_without_vat), 0) AS total
FROM "gold-prd-data-platform-db".payment_lines_current
WHERE payment_date >= CURRENT_DATE - INTERVAL '2' DAY
  AND is_refund = false
GROUP BY 1
ORDER BY 1
`;

const Q_YTD_REVENUE = `
SELECT COALESCE(SUM(p.amount_without_vat), 0) AS total
FROM "gold-prd-data-platform-db".payment_lines_current p
WHERE p.payment_date >= DATE_TRUNC('year', CURRENT_DATE)
  AND p.payment_date < CURRENT_DATE
  AND p.is_refund = false
`;

const Q_YTD_REVENUE_LAST_YEAR = `
SELECT COALESCE(SUM(p.amount_without_vat), 0) AS total
FROM "gold-prd-data-platform-db".payment_lines_current p
WHERE p.payment_date >= DATE_TRUNC('year', CURRENT_DATE - INTERVAL '1' YEAR)
  AND p.payment_date < CURRENT_DATE - INTERVAL '1' YEAR
  AND p.is_refund = false
`;

const Q_NEW_CUSTOMERS = `
SELECT
  DATE_FORMAT(p.first_payment_date, '%Y-%m') AS period,
  COUNT(DISTINCT p.account_id) AS new_count,
  COALESCE(SUM(p.amount_without_vat), 0) AS new_revenue
FROM "gold-prd-data-platform-db".payment_lines_current p
WHERE p.first_payment_date >= DATE_TRUNC('month', DATE_ADD('month', -1, CURRENT_DATE))
  AND p.first_payment_date < DATE_ADD('month', 1, DATE_TRUNC('month', CURRENT_DATE))
  AND p.is_refund = false
GROUP BY 1
ORDER BY 1
`;

const Q_NEW_ARR_YESTERDAY = `
SELECT COUNT(DISTINCT p.account_id) AS new_count,
       COALESCE(SUM(p.amount_without_vat), 0) AS new_revenue
FROM "gold-prd-data-platform-db".payment_lines_current p
WHERE p.first_payment_date >= CURRENT_DATE - INTERVAL '1' DAY
  AND p.first_payment_date < CURRENT_DATE
  AND p.is_refund = false
`;

const Q_NEW_ARR_TODAY = `
SELECT COUNT(DISTINCT p.account_id) AS new_count,
       COALESCE(SUM(p.amount_without_vat), 0) AS new_revenue
FROM "gold-prd-data-platform-db".payment_lines_current p
WHERE p.first_payment_date >= CURRENT_DATE
  AND p.first_payment_date < CURRENT_DATE + INTERVAL '1' DAY
  AND p.is_refund = false
`;

function fmtMonth(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function pctChange(current: number, previous: number): number {
  if (!previous || previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 10000) / 100;
}

function round2(v: number): number {
  return Math.round((v || 0) * 100) / 100;
}

export const GET = withAuth(async () => {
  if (!isConfigured('metabase')) {
    return createSuccessResponse({ data: null });
  }

  try {
    const now = new Date();
    const curMonth = fmtMonth(now);
    const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonth = fmtMonth(prevDate);
    const todayStr = fmtDate(now);
    const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = fmtDate(yesterday);

    const [
      subMrrRaw, creditRaw, monthlyRaw, dailyRaw,
      ytdRaw, ytdLastYearRaw,
      newCustRaw, newArrYesterdayRaw, newArrTodayRaw,
    ] = await Promise.all([
      runNativeQuery<Record<string, string>>(Q_SUBSCRIPTION_MRR),
      runNativeQuery<Record<string, string>>(Q_CREDIT_30D),
      runNativeQuery<Record<string, string>>(Q_MONTHLY_REVENUE),
      runNativeQuery<Record<string, string>>(Q_DAILY_REVENUE),
      runNativeQuery<Record<string, string>>(Q_YTD_REVENUE),
      runNativeQuery<Record<string, string>>(Q_YTD_REVENUE_LAST_YEAR),
      runNativeQuery<Record<string, string>>(Q_NEW_CUSTOMERS),
      runNativeQuery<Record<string, string>>(Q_NEW_ARR_YESTERDAY),
      runNativeQuery<Record<string, string>>(Q_NEW_ARR_TODAY),
    ]);

    const subMrrRow = subMrrRaw[0] || {};
    const creditRow = creditRaw[0] || {};

    let curMonthRev = 0, prevMonthRev = 0;
    for (const row of monthlyRaw) {
      const val = parseFloat(row.total) || 0;
      if (row.month === curMonth) curMonthRev += val;
      else if (row.month === prevMonth) prevMonthRev += val;
    }

    let todayRev = 0, yesterdayRev = 0;
    for (const row of dailyRaw) {
      const val = parseFloat(row.total) || 0;
      const d = (row.day || '').substring(0, 10);
      if (d === todayStr) todayRev = val;
      else if (d === yesterdayStr) yesterdayRev = val;
    }

    const ytdTotal = parseFloat((ytdRaw[0] || {}).total) || 0;
    const ytdLastYear = parseFloat((ytdLastYearRaw[0] || {}).total) || 0;

    let curMonthNewCount = 0, prevMonthNewCount = 0, curMonthNewRevenue = 0, prevMonthNewRevenue = 0;
    for (const row of newCustRaw) {
      const count = parseInt(row.new_count) || 0;
      const revenue = parseFloat(row.new_revenue) || 0;
      if (row.period === curMonth) { curMonthNewCount = count; curMonthNewRevenue = revenue; }
      else if (row.period === prevMonth) { prevMonthNewCount = count; prevMonthNewRevenue = revenue; }
    }

    const yesterdayNewRow = newArrYesterdayRaw[0] || {};
    const todayNewRow = newArrTodayRaw[0] || {};

    return createSuccessResponse({
      data: {
        dashboardCards: {
          subscriptionMRR: round2(parseFloat(subMrrRow.total_subscription_mrr) || 0),
          credit: round2(parseFloat(creditRow.total_credit) || 0),
        },
        revenue: {
          currentMonth: round2(curMonthRev), previousMonth: round2(prevMonthRev),
          monthChangePct: pctChange(curMonthRev, prevMonthRev),
          today: round2(todayRev), yesterday: round2(yesterdayRev),
          dayChangePct: pctChange(todayRev, yesterdayRev),
        },
        ytd: {
          total: round2(ytdTotal), lastYear: round2(ytdLastYear),
          yoyChangePct: pctChange(ytdTotal, ytdLastYear),
          yoyDelta: round2(ytdTotal - ytdLastYear),
        },
        newCustomers: {
          monthCount: curMonthNewCount, previousMonthCount: prevMonthNewCount,
          monthChangePct: pctChange(curMonthNewCount, prevMonthNewCount),
          yesterdayCount: parseInt(yesterdayNewRow.new_count) || 0,
        },
        newARR: {
          today: round2(parseFloat(todayNewRow.new_revenue) || 0),
          todayCount: parseInt(todayNewRow.new_count) || 0,
          yesterday: round2(parseFloat(yesterdayNewRow.new_revenue) || 0),
          yesterdayCount: parseInt(yesterdayNewRow.new_count) || 0,
          month: round2(curMonthNewRevenue), previousMonth: round2(prevMonthNewRevenue),
          monthChangePct: pctChange(curMonthNewRevenue, prevMonthNewRevenue),
        },
        _meta: { generatedAt: now.toISOString(), curMonth, prevMonth },
      },
    });
  } catch (error) {
    return createErrorResponse(error, 'Failed to fetch daily KPIs');
  }
});
