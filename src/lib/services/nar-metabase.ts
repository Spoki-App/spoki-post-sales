/**
 * Builder per il dataset NAR a partire da Metabase + tabella clients.
 *
 * Sostituisce il flusso CSV-Google-Sheets producendo NarRow[] derivate da:
 *   1. usage_analytics_mart.conversation_usage_daily (consumo + tier per (account, week))
 *   2. clients (sync HubSpot) per partner_id, partner_type, country, plan, owner
 *
 * Output: una riga per (account_id × week_offset) negli ultimi N giorni
 * (default 90 = 13 settimane), allineato con il vecchio CSV.
 */

import { config } from '@/lib/config';
import { runNativeQuery } from '@/lib/services/metabase';
import { pgQuery } from '@/lib/db/postgres';
import { getLogger } from '@/lib/logger';
import { HUBSPOT_COMPANY_PROPS } from '@/lib/config/hubspot-props';
import { HUBSPOT_OWNERS } from '@/lib/config/owners';
import type { NarRow } from '@/types/nar';

const logger = getLogger('services:nar-metabase');

interface MetabaseUsageRow {
  account_id: string | number;
  week_count: string | number;
  month_count: string | number;
  week_conversation_count: string | number;
  month_conversation_count: string | number;
  conversation_tier: string | number;
}

interface ClientRow {
  hubspot_id: string;
  name: string | null;
  country: string | null;
  cs_owner_id: string | null;
  plan: string | null;
  raw_properties: Record<string, unknown> | null;
}

function num(value: unknown): number {
  if (value == null) return 0;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function buildUsageQuery(windowDays: number): string {
  // Allargo la finestra di acquisizione daily per coprire interamente la settimana che contiene
  // il giorno (CURRENT_DATE - windowDays): cosi DATE_TRUNC('week') non taglia parzialmente la
  // settimana piu' vecchia.
  const fetchDays = Math.max(windowDays + 14, windowDays);
  const maxWeekOffset = Math.ceil(windowDays / 7);
  // Strategia: CROSS JOIN paying_accounts × week_offsets (0..N) per emettere una riga
  // per (account, week) anche per le settimane senza consumo (= ratio NAR pulled towards 0).
  // Tabella: usage_analytics_mart.conversation_usage_daily ha una riga per (account, day, ...)
  // con `created_date` (la colonna `sent_date` non esiste). Solo righe con
  // `conversation_recharged_count > 0` rappresentano account paganti con tier attivo.
  return `
WITH paying_accounts AS (
  SELECT account_id, MAX(conversation_recharged_count) AS tier
  FROM usage_analytics_mart.conversation_usage_daily
  WHERE created_date >= CURRENT_DATE - INTERVAL '${fetchDays}' DAY
    AND conversation_recharged_count > 0
  GROUP BY account_id
),
week_offsets AS (
  SELECT
    w AS week_count,
    DATE_DIFF(
      'month',
      CAST(DATE_TRUNC('month', DATE_ADD('week', -w, CURRENT_DATE)) AS DATE),
      CAST(DATE_TRUNC('month', CURRENT_DATE) AS DATE)
    ) AS month_count
  FROM UNNEST(SEQUENCE(0, ${maxWeekOffset})) AS t(w)
),
weekly_usage AS (
  SELECT
    account_id,
    DATE_DIFF(
      'week',
      CAST(DATE_TRUNC('week', created_date) AS DATE),
      CAST(DATE_TRUNC('week', CURRENT_DATE) AS DATE)
    ) AS week_count,
    SUM(conversation_count) AS week_conv
  FROM usage_analytics_mart.conversation_usage_daily
  WHERE created_date >= CURRENT_DATE - INTERVAL '${fetchDays}' DAY
  GROUP BY 1, 2
),
monthly_usage AS (
  SELECT
    account_id,
    DATE_DIFF(
      'month',
      CAST(DATE_TRUNC('month', created_date) AS DATE),
      CAST(DATE_TRUNC('month', CURRENT_DATE) AS DATE)
    ) AS month_count,
    SUM(conversation_count) AS month_conv
  FROM usage_analytics_mart.conversation_usage_daily
  WHERE created_date >= CURRENT_DATE - INTERVAL '${fetchDays}' DAY
  GROUP BY 1, 2
),
current_tier AS (
  -- Tier "vivo" dell'account: la massima conversation_recharged_count negli ultimi 40 gg.
  -- 40gg copre un ciclo di rinnovo mensile + slack.
  SELECT
    account_id,
    MAX(conversation_recharged_count) AS tier
  FROM usage_analytics_mart.conversation_usage_daily
  WHERE created_date >= CURRENT_DATE - INTERVAL '40' DAY
    AND conversation_recharged_count > 0
  GROUP BY account_id
)
SELECT
  CAST(pa.account_id AS VARCHAR)             AS account_id,
  wo.week_count                               AS week_count,
  wo.month_count                              AS month_count,
  COALESCE(wu.week_conv, 0)                   AS week_conversation_count,
  COALESCE(mu.month_conv, 0)                  AS month_conversation_count,
  COALESCE(ct.tier, pa.tier, 0)               AS conversation_tier
FROM paying_accounts pa
CROSS JOIN week_offsets wo
LEFT JOIN weekly_usage wu
  ON wu.account_id = pa.account_id AND wu.week_count = wo.week_count
LEFT JOIN monthly_usage mu
  ON mu.account_id = pa.account_id AND mu.month_count = wo.month_count
LEFT JOIN current_tier ct
  ON ct.account_id = pa.account_id
ORDER BY pa.account_id, wo.week_count
`;
}

function ownerNameFromHubspotId(ownerId: string | null | undefined): string {
  if (!ownerId) return '';
  const owner = HUBSPOT_OWNERS[ownerId];
  if (!owner) return '';
  return [owner.firstName, owner.lastName].filter(Boolean).join(' ').trim();
}

function readPartnerProp(
  raw: Record<string, unknown> | null | undefined,
  internalName: string
): string {
  if (!raw || !internalName) return '';
  const value = raw[internalName];
  if (value == null) return '';
  return String(value).trim();
}

export interface BuildNarRowsResult {
  rows: NarRow[];
  metabaseRowCount: number;
  enrichedAccountCount: number;
  unmatchedAccountCount: number;
  weeksCovered: number;
  windowDays: number;
}

export async function buildNarRowsFromMetabase(): Promise<BuildNarRowsResult> {
  const windowDays = config.nar.refreshWindowDays;
  logger.info('Building NAR rows from Metabase', { windowDays });

  const metabaseRows = await runNativeQuery<MetabaseUsageRow>(buildUsageQuery(windowDays));
  logger.info(`Metabase returned ${metabaseRows.length} usage rows`);

  if (metabaseRows.length === 0) {
    return {
      rows: [],
      metabaseRowCount: 0,
      enrichedAccountCount: 0,
      unmatchedAccountCount: 0,
      weeksCovered: 0,
      windowDays,
    };
  }

  const clientsRes = await pgQuery<ClientRow>(
    `SELECT hubspot_id, name, country, cs_owner_id, plan, raw_properties FROM clients`
  );

  const bySpokiAccount = new Map<string, ClientRow>();
  for (const c of clientsRes.rows) {
    const spokiId = c.raw_properties?.[HUBSPOT_COMPANY_PROPS.spokiCompanyIdUnique];
    if (spokiId != null && String(spokiId).trim() !== '') {
      bySpokiAccount.set(String(spokiId).trim(), c);
    }
  }
  logger.info(`Loaded ${clientsRes.rows.length} clients, ${bySpokiAccount.size} mapped to Spoki account_id`);

  const partnerIdKey = HUBSPOT_COMPANY_PROPS.partnerId;
  const partnerTypeKey = HUBSPOT_COMPANY_PROPS.partnerType;
  if (!partnerIdKey || !partnerTypeKey) {
    logger.warn(
      'HUBSPOT_COMPANY_PROP_PARTNER_ID/HUBSPOT_COMPANY_PROP_PARTNER_TYPE non configurate: ' +
        'tutte le righe NAR avranno partner_id/partner_type vuoti (= bucket Direct).'
    );
  }

  const matched = new Set<string>();
  const unmatched = new Set<string>();
  const weeksSet = new Set<number>();

  const rows: NarRow[] = metabaseRows.map(mb => {
    const accountIdStr = String(mb.account_id);
    const client = bySpokiAccount.get(accountIdStr);
    if (client) matched.add(accountIdStr);
    else unmatched.add(accountIdStr);

    const weekCount = num(mb.week_count);
    weeksSet.add(weekCount);

    const partnerId = readPartnerProp(client?.raw_properties, partnerIdKey);
    const partnerType = readPartnerProp(client?.raw_properties, partnerTypeKey);

    return {
      accountId: Number(accountIdStr),
      accountName: client?.name ?? `Account ${accountIdStr}`,
      planSlug: client?.plan ?? '',
      partnerId,
      partnerType,
      countryCode: (client?.country ?? '').trim().toUpperCase(),
      weekCount,
      monthCount: num(mb.month_count),
      conversationTier: num(mb.conversation_tier),
      weekConversationCount: num(mb.week_conversation_count),
      monthConversationCount: num(mb.month_conversation_count),
      companyOwner: ownerNameFromHubspotId(client?.cs_owner_id),
      raw: {
        source: 'metabase',
        hubspot_id: client?.hubspot_id ?? null,
      },
    };
  });

  logger.info(
    `Built ${rows.length} NAR rows: ${matched.size} matched HubSpot, ${unmatched.size} not in clients table`
  );

  return {
    rows,
    metabaseRowCount: metabaseRows.length,
    enrichedAccountCount: matched.size,
    unmatchedAccountCount: unmatched.size,
    weeksCovered: weeksSet.size,
    windowDays,
  };
}
