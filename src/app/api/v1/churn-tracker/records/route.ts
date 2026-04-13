import { NextRequest } from 'next/server';
import { withAuth, createSuccessResponse, createErrorResponse } from '@/lib/api/middleware';
import { pgQuery } from '@/lib/db/postgres';
import { ACTIVE_STATUSES } from '@/types/churn';

function mapRow(r: Record<string, unknown>) {
  return {
    id: r.id,
    accountId: r.account_id,
    accountName: r.account_name,
    planSlug: r.plan_slug,
    conversationLimit: r.conversation_limit ? Number(r.conversation_limit) : null,
    mrrLost: Number(r.mrr_lost) || 0,
    subscriptionEndDate: r.subscription_end_date,
    paymentType: r.payment_type,
    daysSinceExpiry: Number(r.days_since_expiry) || 0,
    hsId: r.hs_id,
    isPartner: r.is_partner === true,
    firstPaymentDate: r.first_payment_date,
    firstPlanSlug: r.first_plan_slug,
    primaryContact: r.primary_contact,
    status: r.status,
    churnReason: r.churn_reason,
    contactOutcome: r.contact_outcome,
    assignedTo: r.assigned_to,
    statusChangedAt: r.status_changed_at,
    firstDetectedAt: r.first_detected_at,
    lastSyncedAt: r.last_synced_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export const GET = withAuth(async (request: NextRequest) => {
  try {
    const url = new URL(request.url);
    const status = url.searchParams.get('status');
    const reason = url.searchParams.get('reason');
    const assigned = url.searchParams.get('assigned');
    const search = url.searchParams.get('q');
    const filter = url.searchParams.get('filter') || 'active';

    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (filter === 'active') {
      const placeholders = ACTIVE_STATUSES.map(() => `$${paramIdx++}`);
      conditions.push(`status IN (${placeholders.join(',')})`);
      params.push(...ACTIVE_STATUSES);
    } else if (filter === 'active_and_lost') {
      conditions.push(`status NOT IN ($${paramIdx++}, $${paramIdx++})`);
      params.push('recuperato', 'rinnovato_auto');
    } else if (status && status !== 'all') {
      conditions.push(`status = $${paramIdx++}`);
      params.push(status);
    }

    if (reason === 'none') {
      conditions.push('churn_reason IS NULL');
    } else if (reason && reason !== 'all') {
      conditions.push(`churn_reason = $${paramIdx++}`);
      params.push(reason);
    }

    if (assigned === 'none') {
      conditions.push('assigned_to IS NULL');
    } else if (assigned && assigned !== 'all') {
      conditions.push(`assigned_to->>'name' = $${paramIdx++}`);
      params.push(assigned);
    }

    if (search) {
      conditions.push(`(account_name ILIKE $${paramIdx} OR CAST(account_id AS TEXT) LIKE $${paramIdx} OR plan_slug ILIKE $${paramIdx})`);
      params.push(`%${search}%`);
      paramIdx++;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await pgQuery(
      `SELECT * FROM churn_records ${where} ORDER BY subscription_end_date ASC`,
      params
    );

    return createSuccessResponse({ data: result.rows.map(mapRow), total: result.rowCount });
  } catch (error) {
    return createErrorResponse(error, 'Failed to fetch churn records');
  }
});
