import { NextRequest } from 'next/server';
import { withAuth, createSuccessResponse, createErrorResponse, ApiError } from '@/lib/api/middleware';
import { runNativeQuery } from '@/lib/services/metabase';
import { pgQuery } from '@/lib/db/postgres';
import { isConfigured } from '@/lib/config';
import { getOwnerName } from '@/lib/config/owners';

const UNDERUTIL_THRESHOLD = 35;
const ALLOWED_DAYS = new Set([30, 60, 90]);

function buildQuery(days: number) {
  return `
SELECT
  CAST(a.hs_id AS VARCHAR) AS hs_id,
  a.name AS account_name,
  SUM(c.conversation_count) AS used,
  MAX(c.max_conversations_available) AS available
FROM usage_analytics_mart.conversation_usage_daily c
JOIN silver_data.accounts a ON a.id = c.account_id
WHERE c.recharge_start_datetime >= DATE_ADD('day', -${days}, CURRENT_TIMESTAMP)
  AND c.max_conversations_available > 0
GROUP BY a.hs_id, a.name
HAVING MAX(c.max_conversations_available) > 0
`;
}

export const GET = withAuth(async (request: NextRequest) => {
  if (!isConfigured('metabase')) {
    return createSuccessResponse({ data: [], total: 0, days: 90 });
  }

  const url = new URL(request.url);
  const days = parseInt(url.searchParams.get('days') ?? '90', 10);
  if (!ALLOWED_DAYS.has(days)) {
    throw new ApiError(400, 'days must be 30, 60 or 90');
  }

  try {
    const rows = await runNativeQuery<{
      hs_id: string;
      account_name: string;
      used: string;
      available: string;
    }>(buildQuery(days));

    const underutilized = rows
      .map(r => {
        const used = parseInt(String(r.used)) || 0;
        const available = parseInt(String(r.available)) || 0;
        if (available <= 0) return null;
        const usedPct = Math.round((used / available) * 100);
        if (usedPct >= UNDERUTIL_THRESHOLD) return null;
        return {
          hsId: String(r.hs_id),
          accountName: String(r.account_name),
          used,
          available,
          usedPct,
        };
      })
      .filter(Boolean) as Array<{
        hsId: string;
        accountName: string;
        used: number;
        available: number;
        usedPct: number;
      }>;

    if (underutilized.length === 0) {
      return createSuccessResponse({ data: [], total: 0, days });
    }

    const hsIds = underutilized.map(u => u.hsId);
    const clientRows = await pgQuery<{
      id: string;
      hubspot_id: string;
      name: string;
      cs_owner_id: string | null;
      plan: string | null;
      mrr: string | null;
    }>(
      `SELECT id, hubspot_id, name, cs_owner_id, plan, mrr
       FROM clients
       WHERE hubspot_id = ANY($1::text[])`,
      [hsIds]
    );

    const clientMap = new Map(
      clientRows.rows.map(r => [r.hubspot_id, r])
    );

    const data = underutilized
      .map(u => {
        const client = clientMap.get(u.hsId);
        return {
          clientId: client?.id ?? null,
          hubspotId: u.hsId,
          name: client?.name ?? u.accountName,
          owner: getOwnerName(client?.cs_owner_id),
          plan: client?.plan ?? null,
          mrr: client?.mrr ? parseFloat(client.mrr) : null,
          used: u.used,
          available: u.available,
          usedPct: u.usedPct,
        };
      })
      .sort((a, b) => a.usedPct - b.usedPct);

    return createSuccessResponse({ data, total: data.length, days });
  } catch (error) {
    return createErrorResponse(error, 'Failed to fetch underutilization data');
  }
});
