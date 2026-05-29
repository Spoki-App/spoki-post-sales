import { NextRequest, NextResponse } from 'next/server';
import { withAuth, createSuccessResponse, createErrorResponse } from '@/lib/api/middleware';
import { fetchTable, runNativeQuery } from '@/lib/services/metabase';
import { isConfigured } from '@/lib/config';

const MRR_TABLE_ID = 225; // finance_mart.mrr_monthly_internal_v

function toNum(v: unknown): number {
  const n = parseFloat(String(v));
  return isNaN(n) ? 0 : n;
}

function toBool(v: unknown): boolean {
  return v === true || v === 'true';
}

function getField(row: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) if (row[k] !== undefined) return row[k];
  return undefined;
}

function currentYearMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export const GET = withAuth(async () => {
  if (!isConfigured('metabase')) {
    return createSuccessResponse({ data: [] });
  }

  try {
    const rows = await fetchTable<Record<string, unknown>>(MRR_TABLE_ID);
    const curMonth = currentYearMonth();
    const round2 = (v: number) => Math.round(v * 100) / 100;

    const monthlyTotals: Record<string, number> = {};
    const nonNewMrr: Record<string, number> = {};
    const nonNewPrevMrr: Record<string, number> = {};
    const comp: Record<string, {
      new_mrr: number; churned_revenue: number; contraction_revenue: number; expansion_mrr: number; reactivation_mrr: number;
      new_count: number; churned_count: number; contracted_count: number; expanded_count: number; reactivation_count: number; retained_count: number;
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
      if (!isNew) { nonNewMrr[month] += mrr; nonNewPrevMrr[month] += prevMrr; }

      if (!comp[month]) {
        comp[month] = {
          new_mrr: 0, churned_revenue: 0, contraction_revenue: 0, expansion_mrr: 0, reactivation_mrr: 0,
          new_count: 0, churned_count: 0, contracted_count: 0, expanded_count: 0, reactivation_count: 0, retained_count: 0,
        };
      }
      const c = comp[month];
      if (isNew) { c.new_mrr += mrr; c.new_count++; }
      else if (isReact && mrr > 0) { c.reactivation_mrr += mrr; c.reactivation_count++; }
      else if (mrr === 0 && prevMrr > 0) { c.churned_revenue += prevMrr; c.churned_count++; }
      else if (prevMrr > 0 && mrr > prevMrr) { c.expansion_mrr += mrr - prevMrr; c.expanded_count++; }
      else if (prevMrr > 0 && mrr > 0 && mrr < prevMrr) { c.contraction_revenue += prevMrr - mrr; c.contracted_count++; }
      else { c.retained_count++; }
    }

    const sortedMonths = Object.keys(monthlyTotals).sort();
    const results = [];

    for (let i = 0; i < sortedMonths.length; i++) {
      const month = sortedMonths[i];
      const c = comp[month];
      const mrrExisting = nonNewPrevMrr[month] || 0;
      const mrrActual = nonNewMrr[month] || 0;
      const nrrPct = mrrExisting > 0 ? Math.round((mrrActual / mrrExisting) * 10000) / 100 : 0;
      const grrPct = mrrExisting > 0
        ? Math.round(((mrrExisting - c.churned_revenue - c.contraction_revenue) / mrrExisting) * 10000) / 100
        : 0;

      if (mrrExisting === 0 && i === 0) continue;

      results.push({
        month, isPartial: month === curMonth, nrrPct, grrPct,
        mrrExisting: round2(mrrExisting), mrrActual: round2(mrrActual), totalMrr: round2(monthlyTotals[month]),
        newMrr: round2(c.new_mrr), newCount: c.new_count,
        churnedRevenue: round2(c.churned_revenue), churnedCount: c.churned_count,
        expansionRevenue: round2(c.expansion_mrr), expandedCount: c.expanded_count,
        contractionRevenue: round2(c.contraction_revenue), contractedCount: c.contracted_count,
        reactivationRevenue: round2(c.reactivation_mrr), reactivationCount: c.reactivation_count,
        retainedCount: c.retained_count,
      });
    }

    return createSuccessResponse({ data: results });
  } catch (error) {
    return createErrorResponse(error, 'Failed to fetch NRR/GRR data');
  }
});
