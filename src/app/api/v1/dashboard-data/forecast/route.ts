import { NextRequest } from 'next/server';
import { withAuth, createSuccessResponse, createErrorResponse, ApiError } from '@/lib/api/middleware';
import { fetchTable } from '@/lib/services/metabase';
import { isConfigured } from '@/lib/config';

const MRR_TABLE_ID = 40;

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

interface AccountTimeSeries {
  month: string;
  mrr: number;
  prevMrr: number;
  isNew: boolean;
  planSlug: string;
}

type Outcome = 'renew' | 'churn' | 'expansion' | 'contraction';

function computeAccountForecast(series: AccountTimeSeries[]): {
  currentMrr: number;
  forecastMrr: number;
  trend3m: number;
  churnRisk: 'low' | 'medium' | 'high';
  predictedOutcome: Outcome;
  confidence: number;
} {
  if (series.length === 0) {
    return { currentMrr: 0, forecastMrr: 0, trend3m: 0, churnRisk: 'high', predictedOutcome: 'churn', confidence: 0 };
  }

  const sorted = [...series].sort((a, b) => a.month.localeCompare(b.month));
  const latest = sorted[sorted.length - 1];
  const currentMrr = latest.mrr;

  const last3 = sorted.slice(-3);
  const mrrValues = last3.map(s => s.mrr);

  // Linear trend over last 3 months
  let trend3m = 0;
  if (mrrValues.length >= 2) {
    const first = mrrValues[0];
    const last = mrrValues[mrrValues.length - 1];
    trend3m = first > 0 ? Math.round(((last - first) / first) * 10000) / 100 : 0;
  }

  // Count consecutive months of contraction
  let contractionStreak = 0;
  for (let i = sorted.length - 1; i >= 1; i--) {
    if (sorted[i].mrr < sorted[i - 1].mrr) contractionStreak++;
    else break;
  }

  // Count gaps (months where mrr was 0)
  const gapCount = sorted.filter(s => s.mrr === 0 && s.prevMrr > 0).length;

  // Determine churn risk
  let churnRisk: 'low' | 'medium' | 'high' = 'low';
  if (currentMrr === 0 || contractionStreak >= 3 || gapCount >= 2) {
    churnRisk = 'high';
  } else if (trend3m < -10 || contractionStreak >= 2) {
    churnRisk = 'medium';
  }

  // Simple forecast: apply monthly average change
  const changes = [];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i - 1].mrr > 0) {
      changes.push(sorted[i].mrr - sorted[i - 1].mrr);
    }
  }
  const avgChange = changes.length > 0 ? changes.reduce((a, b) => a + b, 0) / changes.length : 0;
  const forecastMrr = Math.max(0, Math.round((currentMrr + avgChange) * 100) / 100);

  // Predict outcome
  let predictedOutcome: Outcome = 'renew';
  let confidence = 0.6;

  if (churnRisk === 'high') {
    predictedOutcome = 'churn';
    confidence = 0.7 + Math.min(contractionStreak * 0.05, 0.2);
  } else if (trend3m > 5) {
    predictedOutcome = 'expansion';
    confidence = 0.5 + Math.min(trend3m / 100, 0.3);
  } else if (trend3m < -5) {
    predictedOutcome = 'contraction';
    confidence = 0.5 + Math.min(Math.abs(trend3m) / 100, 0.3);
  } else {
    predictedOutcome = 'renew';
    confidence = 0.7;
  }

  return {
    currentMrr,
    forecastMrr,
    trend3m,
    churnRisk,
    predictedOutcome,
    confidence: Math.round(confidence * 100) / 100,
  };
}

export const GET = withAuth(async (request: NextRequest) => {
  if (!isConfigured('metabase')) {
    return createSuccessResponse({ data: null });
  }

  const url = new URL(request.url);
  const accountIdParam = url.searchParams.get('account_id');

  if (!accountIdParam) {
    throw new ApiError(400, 'account_id is required');
  }

  try {
    const rows = await fetchTable<Record<string, unknown>>(MRR_TABLE_ID);
    const curMonth = currentYearMonth();

    const accountSeries: AccountTimeSeries[] = [];
    for (const row of rows) {
      const aId = String(getField(row, 'account_id', 'Account ID') || '');
      if (aId !== accountIdParam) continue;

      const month = String(getField(row, 'month', 'Month') || '');
      if (!month || month > curMonth) continue;

      accountSeries.push({
        month,
        mrr: toNum(getField(row, 'mrr_amount', 'Mrr Amount')),
        prevMrr: toNum(getField(row, 'previous_mrr_amount', 'Previous Mrr Amount')),
        isNew: toBool(getField(row, 'is_new_customer', 'Is New Customer')),
        planSlug: String(getField(row, 'plan_slug', 'Plan Slug') || ''),
      });
    }

    const forecast = computeAccountForecast(accountSeries);

    return createSuccessResponse({ data: forecast });
  } catch (error) {
    return createErrorResponse(error, 'Failed to compute forecast');
  }
});
