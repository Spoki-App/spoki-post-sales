import { runNativeQuery } from '@/lib/services/metabase';
import { isConfigured } from '@/lib/config';
import { getLogger } from '@/lib/logger';

const logger = getLogger('services:qbr-metabase');

export interface BillingPeriodUsage {
  periodStart: string;
  periodEnd: string;
  conversationsIncluded: number;
  conversationsAvailable: number;
  used: number;
  isCurrent: boolean;
}

export interface QbrUsageData {
  accountId: number | null;
  accountName: string | null;
  currentPlan: string | null;
  conversationsTier: number | null;
  maxConversationsAvailable: number | null;
  billing: string | null;
  mrrHistory: Array<{ month: string; mrr: number }>;
  currentMrr: number | null;
  mrrTrend: 'up' | 'down' | 'stable' | null;
  subscriptionTotal: number;
  rechargeTotal: number;
  billingPeriods: BillingPeriodUsage[];
  totalMessages3m: number;
  messagesInbound: number;
  messagesOutbound: number;
  contactsContactedMonthly: number;
  smsSentMonthly: number;
  integrationsEnabledCount: number;
  automationsActiveCount: number;
}

const EMPTY: QbrUsageData = {
  accountId: null, accountName: null, currentPlan: null,
  conversationsTier: null, maxConversationsAvailable: null, billing: null,
  mrrHistory: [], currentMrr: null, mrrTrend: null,
  subscriptionTotal: 0, rechargeTotal: 0,
  billingPeriods: [],
  totalMessages3m: 0, messagesInbound: 0, messagesOutbound: 0,
  contactsContactedMonthly: 0, smsSentMonthly: 0,
  integrationsEnabledCount: 0, automationsActiveCount: 0,
};

function resolveAccountIdQuery(hsId: string) {
  return `
SELECT a.id, a.name
FROM silver_data.accounts a
WHERE CAST(a.hs_id AS VARCHAR) = '${hsId}'
LIMIT 1
`;
}

function mrrHistoryQuery(accountId: number) {
  return `
SELECT
  month, mrr_amount, plan_slug, conversations
FROM finance_mart.mrr_monthly_internal_v
WHERE account_id = ${accountId}
  AND month >= DATE_FORMAT(DATE_ADD('month', -3, CURRENT_DATE), '%Y-%m')
ORDER BY month DESC
`;
}

function paymentsQuery(accountId: number) {
  return `
SELECT
  payment_type, amount_without_vat
FROM gold_data.payment_lines_current
WHERE account_id = ${accountId}
  AND payment_date >= CURRENT_DATE - INTERVAL '3' MONTH
  AND is_refund = false
`;
}

function billingPeriodsQuery(accountId: number) {
  return `
SELECT
  CAST(recharge_start_datetime AS DATE) AS period_start,
  CAST(recharge_expire_datetime AS DATE) AS period_end,
  conversation_recharged_count AS included,
  max_conversations_available AS available,
  SUM(conversation_count) AS used
FROM usage_analytics_mart.conversation_usage_daily
WHERE account_id = ${accountId}
  AND recharge_start_datetime >= DATE_ADD('month', -3, CURRENT_TIMESTAMP)
GROUP BY 1, 2, 3, 4
ORDER BY period_start DESC
`;
}

function messagesQuery(accountId: number) {
  return `
SELECT
  direction,
  SUM(message_count) AS total
FROM gold_data.messages_per_account
WHERE account_id = ${accountId}
  AND sent_date >= CAST(DATE_FORMAT(DATE_ADD('month', -3, CURRENT_DATE), '%Y-%m-%d') AS DATE)
GROUP BY direction
`;
}

function subscriptionQuery(accountId: number) {
  return `
SELECT plan_slug, subscription_period, conversations_tier, period_start
FROM (
  SELECT plan_slug, subscription_period, conversations_tier, period_start,
    ROW_NUMBER() OVER (PARTITION BY plan_slug, period_start, period_end ORDER BY event_time DESC) AS rn
  FROM gold_data.subscription_history
  WHERE account_id = ${accountId}
    AND plan_slug IS NOT NULL AND plan_slug <> ''
)
WHERE rn = 1
ORDER BY period_start DESC
FETCH FIRST 1 ROWS ONLY
`;
}

function contactsContactedQuery(accountId: number) {
  return `
SELECT COALESCE(SUM(conversation_count), 0) AS contacted
FROM gold_data.conversations_monthly
WHERE account_id = ${accountId}
  AND year_month = DATE_FORMAT(DATE_ADD('month', -1, CURRENT_DATE), '%Y-%m')
`;
}

function smsSentQuery(accountId: number) {
  return `
SELECT COALESCE(SUM(message_count), 0) AS sms_sent
FROM gold_data.messages_per_account
WHERE account_id = ${accountId}
  AND direction = 'OUTBOUND'
  AND sent_date >= DATE_ADD('month', -1, CURRENT_DATE)
`;
}

function integrationsAndAutomationsQuery(accountId: number) {
  return `
SELECT
  COUNT(DISTINCT integration_name) AS integrations_enabled,
  COALESCE(SUM(automation_count), 0) AS automations_active
FROM gold_data.fact_integration_automations_summary
WHERE account_id = ${accountId}
`;
}

function safeQuery<T>(query: string, label: string): Promise<T[]> {
  return runNativeQuery<T>(query).catch(err => {
    logger.warn(`${label} query failed`, { error: String(err) });
    return [] as T[];
  });
}

export async function fetchQbrUsageData(hubspotId: string): Promise<QbrUsageData> {
  if (!isConfigured('metabase')) {
    logger.info('Metabase not configured, skipping QBR usage data');
    return EMPTY;
  }

  try {
    const accountRows = await runNativeQuery<{ id: number; name: string }>(
      resolveAccountIdQuery(hubspotId),
    );
    if (accountRows.length === 0) {
      logger.info(`No Metabase account found for hs_id=${hubspotId}`);
      return EMPTY;
    }

    const accountId = accountRows[0].id;
    const accountName = accountRows[0].name;

    const [mrrRows, paymentRows, subRows, billingRows, msgRows, contactsRows, smsRows, intAutoRows] = await Promise.all([
      safeQuery<{ month: string; mrr_amount: string; plan_slug: string; conversations: string }>(
        mrrHistoryQuery(accountId), 'MRR'),
      safeQuery<{ payment_type: string; amount_without_vat: string }>(
        paymentsQuery(accountId), 'Payments'),
      safeQuery<{ plan_slug: string; subscription_period: string; conversations_tier: string }>(
        subscriptionQuery(accountId), 'Subscription'),
      safeQuery<{ period_start: string; period_end: string; included: string; available: string; used: string }>(
        billingPeriodsQuery(accountId), 'BillingPeriods'),
      safeQuery<{ direction: string; total: string }>(
        messagesQuery(accountId), 'Messages'),
      safeQuery<{ contacted: string }>(
        contactsContactedQuery(accountId), 'ContactsContacted'),
      safeQuery<{ sms_sent: string }>(
        smsSentQuery(accountId), 'SmsSent'),
      safeQuery<{ integrations_enabled: string; automations_active: string }>(
        integrationsAndAutomationsQuery(accountId), 'IntegrationsAutomations'),
    ]);

    // MRR
    const mrrHistory = mrrRows.map(r => ({
      month: String(r.month),
      mrr: parseFloat(String(r.mrr_amount)) || 0,
    })).sort((a, b) => a.month.localeCompare(b.month));

    const currentMrr = mrrHistory.length > 0 ? mrrHistory[mrrHistory.length - 1].mrr : null;
    let mrrTrend: QbrUsageData['mrrTrend'] = null;
    if (mrrHistory.length >= 2) {
      const prev = mrrHistory[mrrHistory.length - 2].mrr;
      const curr = mrrHistory[mrrHistory.length - 1].mrr;
      if (curr > prev * 1.02) mrrTrend = 'up';
      else if (curr < prev * 0.98) mrrTrend = 'down';
      else mrrTrend = 'stable';
    }

    // Subscription
    const latestMrr = mrrRows[0];
    const currentPlan = subRows[0]?.plan_slug ?? latestMrr?.plan_slug ?? null;
    const conversationsTier = subRows[0]?.conversations_tier
      ? parseInt(subRows[0].conversations_tier) : (latestMrr?.conversations ? parseInt(latestMrr.conversations) : null);
    const billing = subRows[0]?.subscription_period ?? null;

    // Usage limits from billing periods
    const maxConversationsAvailable = billingRows[0]?.available
      ? parseInt(String(billingRows[0].available)) : null;

    // Payments
    let subscriptionTotal = 0;
    let rechargeTotal = 0;
    for (const r of paymentRows) {
      const amt = parseFloat(String(r.amount_without_vat)) || 0;
      const pt = (r.payment_type || '').toLowerCase();
      const isRecharge = pt.includes('recharge') || pt.includes('credit') || pt.includes('ricarica');
      if (isRecharge) rechargeTotal += amt;
      else subscriptionTotal += amt;
    }

    // Billing periods
    const today = new Date().toISOString().slice(0, 10);
    const billingPeriods: BillingPeriodUsage[] = billingRows.map(r => ({
      periodStart: String(r.period_start),
      periodEnd: String(r.period_end),
      conversationsIncluded: parseInt(String(r.included)) || 0,
      conversationsAvailable: parseInt(String(r.available)) || 0,
      used: parseInt(String(r.used)) || 0,
      isCurrent: String(r.period_start) <= today && String(r.period_end) >= today,
    })).sort((a, b) => a.periodStart.localeCompare(b.periodStart));

    // Messages
    let messagesInbound = 0;
    let messagesOutbound = 0;
    for (const r of msgRows) {
      const count = parseInt(String(r.total)) || 0;
      if (r.direction === 'INBOUND') messagesInbound += count;
      else messagesOutbound += count;
    }
    const totalMessages3m = messagesInbound + messagesOutbound;

    // Product metrics
    const contactsContactedMonthly = parseInt(String(contactsRows[0]?.contacted)) || 0;
    const smsSentMonthly = parseInt(String(smsRows[0]?.sms_sent)) || 0;
    const integrationsEnabledCount = parseInt(String(intAutoRows[0]?.integrations_enabled)) || 0;
    const automationsActiveCount = parseInt(String(intAutoRows[0]?.automations_active)) || 0;

    return {
      accountId, accountName,
      currentPlan, conversationsTier, maxConversationsAvailable, billing,
      mrrHistory, currentMrr, mrrTrend,
      subscriptionTotal: Math.round(subscriptionTotal * 100) / 100,
      rechargeTotal: Math.round(rechargeTotal * 100) / 100,
      billingPeriods,
      totalMessages3m, messagesInbound, messagesOutbound,
      contactsContactedMonthly, smsSentMonthly,
      integrationsEnabledCount, automationsActiveCount,
    };
  } catch (err) {
    logger.warn('Failed to fetch QBR usage data from Metabase', { error: String(err) });
    return EMPTY;
  }
}
