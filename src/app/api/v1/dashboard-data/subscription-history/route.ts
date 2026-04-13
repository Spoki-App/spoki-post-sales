import { NextRequest } from 'next/server';
import { withAuth, createSuccessResponse, createErrorResponse, ApiError } from '@/lib/api/middleware';
import { runNativeQuery } from '@/lib/services/metabase';
import { isConfigured } from '@/lib/config';

function buildQuery(accountId: number) {
  return `
SELECT plan_slug, period_start, period_end, subscription_period, conversations_tier
FROM (
  SELECT plan_slug, period_start, period_end, subscription_period, conversations_tier,
    ROW_NUMBER() OVER (PARTITION BY plan_slug, period_start, period_end ORDER BY event_time DESC) AS rn
  FROM gold_data.subscription_history
  WHERE account_id = ${accountId}
    AND plan_slug IS NOT NULL AND plan_slug <> ''
)
WHERE rn = 1
ORDER BY period_start DESC
`;
}

export const GET = withAuth(async (request: NextRequest) => {
  if (!isConfigured('metabase')) {
    return createSuccessResponse({ data: { accountId: 0, subscriptions: [] } });
  }

  const url = new URL(request.url);
  const accountIdParam = url.searchParams.get('account_id');

  if (!accountIdParam || isNaN(parseInt(accountIdParam, 10))) {
    throw new ApiError(400, 'account_id is required and must be numeric');
  }

  const accountId = parseInt(accountIdParam, 10);

  try {
    const rows = await runNativeQuery<{
      plan_slug: string; period_start: string; period_end: string;
      subscription_period: string; conversations_tier: string;
    }>(buildQuery(accountId));

    const subscriptions = rows.map(r => ({
      planSlug: r.plan_slug || '',
      periodStart: r.period_start || null,
      periodEnd: r.period_end || null,
      billing: r.subscription_period || '',
      conversations: parseInt(r.conversations_tier) || 0,
    }));

    return createSuccessResponse({
      data: { accountId, subscriptions },
    });
  } catch (error) {
    return createErrorResponse(error, 'Failed to fetch subscription history');
  }
});
