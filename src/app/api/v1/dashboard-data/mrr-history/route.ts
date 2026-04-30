import { NextRequest, NextResponse } from 'next/server';
import { withAuth, createSuccessResponse, createErrorResponse } from '@/lib/api/middleware';
import { fetchTable, runNativeQuery } from '@/lib/services/metabase';
import { isConfigured } from '@/lib/config';

const MRR_TABLE_ID = 225; // finance_mart.mrr_monthly_internal_v (Metabase table id, refreshed dopo rename schema)

function toNum(v: unknown): number {
  const n = parseFloat(String(v));
  return isNaN(n) ? 0 : n;
}

function toBool(v: unknown): boolean {
  return v === true || v === 'true';
}

function getField(row: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) {
    if (row[k] !== undefined) return row[k];
  }
  return undefined;
}

function currentYearMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const Q_PAYMENT_REVENUE_MONTHLY = `
SELECT
  DATE_FORMAT(payment_date, '%Y-%m') AS month,
  SUM(CASE WHEN payment_type = 'Credit' THEN amount_without_vat ELSE 0 END) AS credit_revenue,
  SUM(CASE WHEN payment_type IN ('Exceeded Conversations', 'Additional Conversations Package')
      THEN amount_without_vat ELSE 0 END) AS exceeded_revenue
FROM gold_data.payment_lines_current
WHERE payment_date >= DATE_ADD('month', -24, CURRENT_DATE)
  AND is_refund = false
GROUP BY 1
ORDER BY 1
`;

interface NrrResult {
  month: string;
  isPartial: boolean;
  nrrPct: number;
  grrPct: number;
  mrrExisting: number;
  mrrActual: number;
  totalMrr: number;
  newMrr: number;
  newCount: number;
  reactivationCount: number;
  retainedCount: number;
  churnedCount: number;
  expandedCount: number;
  contractedCount: number;
  churnedRevenue: number;
  expansionRevenue: number;
  contractionRevenue: number;
  reactivationRevenue: number;
}

function computeNrrMonthly(
  rows: Record<string, unknown>[],
  paymentRevenueRows: Record<string, unknown>[] | null
): NrrResult[] {
  const curMonth = currentYearMonth();
  const round2 = (v: number) => Math.round(v * 100) / 100;

  const paymentRevByMonth: Record<string, { credit: number; exceeded: number }> = {};
  if (paymentRevenueRows) {
    for (const r of paymentRevenueRows) {
      const m = String(r.month || '');
      if (m) {
        paymentRevByMonth[m] = {
          credit: toNum(r.credit_revenue),
          exceeded: toNum(r.exceeded_revenue),
        };
      }
    }
  }

  const monthlyTotals: Record<string, number> = {};
  const nonNewMrr: Record<string, number> = {};
  const nonNewPrevMrr: Record<string, number> = {};
  const monthlyComponents: Record<string, {
    new_mrr: number; reactivation_mrr: number; expansion_mrr: number;
    churned_revenue: number; contraction_revenue: number;
    new_count: number; reactivation_count: number; expanded_count: number;
    churned_count: number; contracted_count: number; retained_count: number;
  }> = {};

  for (const row of rows) {
    const month = String(getField(row, 'month', 'Month') || '');
    if (!month || month > curMonth) continue;

    const mrr = toNum(getField(row, 'mrr_amount', 'Mrr Amount'));
    const prevMrr = toNum(getField(row, 'previous_mrr_amount', 'Previous Mrr Amount'));
    const isNew = toBool(getField(row, 'is_new_customer', 'Is New Customer'));
    const isReact = toBool(getField(row, 'is_reactivation', 'Is Reactivation'));

    monthlyTotals[month] = (monthlyTotals[month] || 0) + mrr;

    if (!nonNewMrr[month]) { nonNewMrr[month] = 0; nonNewPrevMrr[month] = 0; }
    if (!isNew) {
      nonNewMrr[month] += mrr;
      nonNewPrevMrr[month] += prevMrr;
    }

    if (!monthlyComponents[month]) {
      monthlyComponents[month] = {
        new_mrr: 0, reactivation_mrr: 0, expansion_mrr: 0,
        churned_revenue: 0, contraction_revenue: 0,
        new_count: 0, reactivation_count: 0, expanded_count: 0,
        churned_count: 0, contracted_count: 0, retained_count: 0,
      };
    }
    const c = monthlyComponents[month];

    if (isNew) { c.new_mrr += mrr; c.new_count++; }
    else if (isReact && mrr > 0) { c.reactivation_mrr += mrr; c.reactivation_count++; }
    else if (mrr === 0 && prevMrr > 0) { c.churned_revenue += prevMrr; c.churned_count++; }
    else if (prevMrr > 0 && mrr > prevMrr) { c.expansion_mrr += mrr - prevMrr; c.expanded_count++; }
    else if (prevMrr > 0 && mrr > 0 && mrr < prevMrr) { c.contraction_revenue += prevMrr - mrr; c.contracted_count++; }
    else { c.retained_count++; }
  }

  const sortedMonths = Object.keys(monthlyTotals).sort();

  const results: NrrResult[] = [];
  for (let i = 0; i < sortedMonths.length; i++) {
    const month = sortedMonths[i];
    const c = monthlyComponents[month];
    const mrrExisting = nonNewPrevMrr[month] || 0;
    const mrrActual = nonNewMrr[month] || 0;
    const nrrPct = mrrExisting > 0 ? Math.round((mrrActual / mrrExisting) * 10000) / 100 : 0;
    const grrPct = mrrExisting > 0
      ? Math.round(((mrrExisting - c.churned_revenue - c.contraction_revenue) / mrrExisting) * 10000) / 100
      : 0;

    if (mrrExisting === 0 && i === 0) continue;

    results.push({
      month,
      isPartial: month === curMonth,
      nrrPct, grrPct,
      mrrExisting: round2(mrrExisting),
      mrrActual: round2(mrrActual),
      totalMrr: round2(monthlyTotals[month]),
      newMrr: round2(c.new_mrr),
      newCount: c.new_count,
      reactivationCount: c.reactivation_count,
      retainedCount: c.retained_count,
      churnedCount: c.churned_count,
      expandedCount: c.expanded_count,
      contractedCount: c.contracted_count,
      churnedRevenue: round2(c.churned_revenue),
      expansionRevenue: round2(c.expansion_mrr),
      contractionRevenue: round2(c.contraction_revenue),
      reactivationRevenue: round2(c.reactivation_mrr),
    });
  }

  return results;
}

export const GET = withAuth(async (request: NextRequest) => {
  if (!isConfigured('metabase')) {
    return createSuccessResponse({ data: [] });
  }

  try {
    const url = new URL(request.url);
    const accountId = url.searchParams.get('account_id');

    const [rows, paymentRevenueRows] = await Promise.all([
      fetchTable<Record<string, unknown>>(MRR_TABLE_ID),
      runNativeQuery<Record<string, unknown>>(Q_PAYMENT_REVENUE_MONTHLY),
    ]);

    let nrrData = computeNrrMonthly(rows, paymentRevenueRows);

    // If account_id is provided, also return per-account MRR history
    let accountMrr: Array<{ month: string; mrr: number; prevMrr: number; category: string }> | undefined;
    if (accountId) {
      const curMonth = currentYearMonth();
      accountMrr = [];
      for (const row of rows) {
        const aId = String(getField(row, 'account_id', 'Account ID') || '');
        if (aId !== accountId) continue;
        const month = String(getField(row, 'month', 'Month') || '');
        if (!month || month > curMonth) continue;
        const mrr = toNum(getField(row, 'mrr_amount', 'Mrr Amount'));
        const prevMrr = toNum(getField(row, 'previous_mrr_amount', 'Previous Mrr Amount'));
        const isNew = toBool(getField(row, 'is_new_customer', 'Is New Customer'));
        let category = 'retained';
        if (isNew) category = 'new';
        else if (mrr === 0 && prevMrr > 0) category = 'churn';
        else if (prevMrr > 0 && mrr > prevMrr) category = 'expansion';
        else if (prevMrr > 0 && mrr > 0 && mrr < prevMrr) category = 'contraction';
        accountMrr.push({ month, mrr: Math.round(mrr * 100) / 100, prevMrr: Math.round(prevMrr * 100) / 100, category });
      }
      accountMrr.sort((a, b) => a.month.localeCompare(b.month));
    }

    return createSuccessResponse({
      data: nrrData,
      ...(accountMrr ? { accountMrr } : {}),
    });
  } catch (error) {
    return createErrorResponse(error, 'Failed to fetch MRR history');
  }
});
