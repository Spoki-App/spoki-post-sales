import { NextRequest } from 'next/server';
import { withAuth, createSuccessResponse, createErrorResponse, ApiError } from '@/lib/api/middleware';
import { runNativeQuery } from '@/lib/services/metabase';
import { isConfigured } from '@/lib/config';

function buildAccountPaymentsQuery(accountId: number) {
  return `
SELECT
  payment_type,
  payment_date,
  amount_without_vat,
  plan_slug,
  description
FROM gold_data.payment_lines_current
WHERE account_id = ${accountId}
  AND payment_date >= CURRENT_DATE - INTERVAL '3' MONTH
  AND is_refund = false
ORDER BY payment_date DESC
`;
}

function buildFailedPaymentsQuery(accountIds: number[]) {
  return `
SELECT DISTINCT account_id
FROM gold_data.payment_lines_current
WHERE account_id IN (${accountIds.join(',')})
  AND payment_date >= CURRENT_DATE - INTERVAL '30' DAY
  AND is_refund = false
  AND amount_without_vat > 0
`;
}

export const GET = withAuth(async (request: NextRequest) => {
  if (!isConfigured('metabase')) {
    return createSuccessResponse({ data: null });
  }

  const url = new URL(request.url);
  const accountIdParam = url.searchParams.get('account_id');

  if (!accountIdParam || isNaN(parseInt(accountIdParam, 10))) {
    throw new ApiError(400, 'account_id is required and must be numeric');
  }

  const accountId = parseInt(accountIdParam, 10);

  try {
    const rows = await runNativeQuery<{
      payment_type: string; payment_date: string;
      amount_without_vat: string; plan_slug: string; description: string;
    }>(buildAccountPaymentsQuery(accountId));

    let subscriptionTotal = 0;
    let rechargeTotal = 0;
    const subscriptions: Array<{ date: string; amount: number; plan: string; description: string }> = [];
    const recharges: Array<{ date: string; amount: number; plan: string; description: string }> = [];

    for (const row of rows) {
      const amt = parseFloat(row.amount_without_vat) || 0;
      const pt = (row.payment_type || '').toLowerCase();
      const entry = {
        date: row.payment_date,
        amount: amt,
        plan: row.plan_slug || '',
        description: row.description || '',
      };

      if (pt.includes('recharge') || pt.includes('credit') || pt.includes('ricarica')) {
        rechargeTotal += amt;
        recharges.push(entry);
      } else {
        subscriptionTotal += amt;
        subscriptions.push(entry);
      }
    }

    return createSuccessResponse({
      data: {
        accountId,
        period: 'last_3_months',
        subscriptions: { total: Math.round(subscriptionTotal * 100) / 100, lines: subscriptions },
        recharges: { total: Math.round(rechargeTotal * 100) / 100, lines: recharges },
      },
    });
  } catch (error) {
    return createErrorResponse(error, 'Failed to fetch payment status');
  }
});
