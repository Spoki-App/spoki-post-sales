import { NextRequest } from 'next/server';
import { withAuth, createSuccessResponse, createErrorResponse } from '@/lib/api/middleware';
import { pgQuery } from '@/lib/db/postgres';
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

function normalizeDate(d: unknown): string | null {
  if (!d) return null;
  if (d instanceof Date) return d.toISOString().split('T')[0];
  const s = String(d);
  if (s.includes('T')) return s.split('T')[0];
  return s.slice(0, 10);
}

export const POST = withAuth(async () => {
  if (!isConfigured('metabase')) {
    return createErrorResponse(new Error('Metabase not configured'), 'Metabase not configured');
  }

  try {
    const rows = await runNativeQuery<Record<string, unknown>>(CHURN_QUERY);
    let added = 0, updated = 0, renewed = 0;

    const activeIds = new Set<string>();

    for (const row of rows) {
      const accountId = Number(row.account_id);
      const subEndDate = normalizeDate(row.subscription_end_date);
      const key = `${accountId}_${subEndDate}`;
      activeIds.add(key);

      const result = await pgQuery(
        `INSERT INTO churn_records (
          account_id, account_name, plan_slug, conversation_limit, mrr_lost,
          subscription_end_date, payment_type, days_since_expiry, hs_id,
          is_partner, first_payment_date, first_plan_slug, primary_contact,
          last_synced_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW())
        ON CONFLICT (account_id, subscription_end_date) DO UPDATE SET
          days_since_expiry = EXCLUDED.days_since_expiry,
          hs_id = COALESCE(EXCLUDED.hs_id, churn_records.hs_id),
          primary_contact = COALESCE(EXCLUDED.primary_contact, churn_records.primary_contact),
          last_synced_at = NOW(),
          status = CASE WHEN churn_records.status = 'rinnovato_auto' THEN 'nuovo' ELSE churn_records.status END,
          status_changed_at = CASE WHEN churn_records.status = 'rinnovato_auto' THEN NOW() ELSE churn_records.status_changed_at END
        RETURNING (xmax = 0) AS is_insert`,
        [
          accountId,
          row.account_name || null,
          row.plan_slug || null,
          row.conversation_limit ? parseInt(String(row.conversation_limit)) : null,
          parseFloat(String(row.mrr_lost)) || 0,
          subEndDate,
          row.payment_type || null,
          parseInt(String(row.days_since_expiry)) || 0,
          row.hs_id || null,
          row.ispartner === 'true' || row.ispartner === true,
          row.first_payment_date || null,
          row.first_plan_slug || null,
          row.primary_contact || null,
        ]
      );

      if (result.rows[0]?.is_insert) added++;
      else updated++;
    }

    // Mark records not in the current sync as auto-renewed (if still in active status)
    const allRes = await pgQuery(
      `SELECT id, account_id, subscription_end_date, status FROM churn_records
       WHERE status NOT IN ('perso', 'recuperato', 'rinnovato_auto')`
    );

    for (const rec of allRes.rows) {
      const key = `${rec.account_id}_${normalizeDate(rec.subscription_end_date)}`;
      if (!activeIds.has(key)) {
        await pgQuery(
          `UPDATE churn_records SET status = 'rinnovato_auto', status_changed_at = NOW() WHERE id = $1`,
          [rec.id]
        );
        renewed++;
      }
    }

    return createSuccessResponse({
      data: { added, updated, renewed, total: rows.length },
    });
  } catch (error) {
    return createErrorResponse(error, 'Failed to sync churn data');
  }
});
