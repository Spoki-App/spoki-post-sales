import { NextRequest } from 'next/server';
import { withAuth, createSuccessResponse, createErrorResponse } from '@/lib/api/middleware';
import { runNativeQuery } from '@/lib/services/metabase';
import { isConfigured } from '@/lib/config';

const CHURN_QUERY = `
WITH latest_active AS (
  SELECT
    account_id, account_name, plan_slug, conversations, mrr_amount,
    subscription_end_date, payment_type, payment_date, is_partner, first_payment_date,
    ROW_NUMBER() OVER (
      PARTITION BY account_id
      ORDER BY subscription_end_date DESC, payment_date DESC
    ) AS rn
  FROM "finance-mart-prd-data-platform-db".mrr_monthly_internal
  WHERE mrr_amount > 0
),
expired AS (
  SELECT * FROM latest_active
  WHERE rn = 1
    AND subscription_end_date >= DATE_TRUNC('month', CURRENT_DATE)
    AND subscription_end_date <= CURRENT_DATE
),
renewals AS (
  SELECT DISTINCT m.account_id
  FROM expired e
  JOIN "finance-mart-prd-data-platform-db".mrr_monthly_internal m
    ON e.account_id = m.account_id
    AND m.subscription_start_date >= e.subscription_end_date
    AND m.mrr_amount > 0
),
first_plans AS (
  SELECT account_id, plan_slug AS first_plan_slug
  FROM (
    SELECT account_id, plan_slug,
           ROW_NUMBER() OVER (PARTITION BY account_id ORDER BY subscription_start_date ASC) AS rn
    FROM "finance-mart-prd-data-platform-db".mrr_monthly_internal
    WHERE mrr_amount > 0
  ) t WHERE t.rn = 1
),
primary_contacts AS (
  SELECT
    r.account_id,
    u.firstname || ' ' || u.surname || ' - ' || u.email
      || COALESCE(' - ' || u.phone, '') AS primary_contact,
    ROW_NUMBER() OVER (PARTITION BY r.account_id ORDER BY u.id) AS rn
  FROM "silver-prd-data-platform-db".roles r
  JOIN "silver-prd-data-platform-db".users u ON r.user_id = u.id
  WHERE r.is_active = true AND r.role = 1
)
SELECT
  e.account_id, e.account_name, e.plan_slug,
  e.conversations AS conversation_limit,
  e.mrr_amount AS mrr_lost, e.subscription_end_date, e.payment_type,
  DATE_DIFF('day', e.subscription_end_date, CURRENT_DATE) AS days_since_expiry,
  acc.hs_id, e.is_partner AS ispartner,
  e.first_payment_date, fp.first_plan_slug, pc.primary_contact
FROM expired e
LEFT JOIN renewals r ON e.account_id = r.account_id
LEFT JOIN "silver-prd-data-platform-db".accounts acc ON e.account_id = acc.id
LEFT JOIN first_plans fp ON e.account_id = fp.account_id
LEFT JOIN primary_contacts pc ON e.account_id = pc.account_id AND pc.rn = 1
WHERE r.account_id IS NULL
ORDER BY e.subscription_end_date ASC
`;

export const GET = withAuth(async () => {
  if (!isConfigured('metabase')) {
    return createSuccessResponse({ data: [] });
  }

  try {
    const rows = await runNativeQuery<Record<string, unknown>>(CHURN_QUERY);

    const churnRecords = rows.map(r => ({
      accountId: r.account_id,
      accountName: r.account_name,
      planSlug: r.plan_slug || null,
      conversationLimit: r.conversation_limit ? parseInt(String(r.conversation_limit)) : null,
      mrrLost: parseFloat(String(r.mrr_lost)) || 0,
      subscriptionEndDate: r.subscription_end_date,
      paymentType: r.payment_type,
      daysSinceExpiry: parseInt(String(r.days_since_expiry)) || 0,
      hsId: r.hs_id || null,
      isPartner: r.ispartner === 'true' || r.ispartner === true,
      firstPaymentDate: r.first_payment_date || null,
      firstPlanSlug: r.first_plan_slug || null,
      primaryContact: r.primary_contact || null,
    }));

    const totalMrrAtRisk = churnRecords.reduce((sum, r) => sum + r.mrrLost, 0);

    return createSuccessResponse({
      data: churnRecords,
      summary: {
        total: churnRecords.length,
        totalMrrAtRisk: Math.round(totalMrrAtRisk * 100) / 100,
      },
    });
  } catch (error) {
    return createErrorResponse(error, 'Failed to fetch churn details');
  }
});
