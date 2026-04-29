import { NextRequest } from 'next/server';
import { withAuth, createSuccessResponse, createErrorResponse, ApiError } from '@/lib/api/middleware';
import { pgQuery } from '@/lib/db/postgres';
import {
  applyFilters,
  buildExclusionSets,
  computeBucketAnalysis,
  computeWeeklyTrend,
} from '@/lib/services/nar-buckets';
import { computeOperatorsAnalysis } from '@/lib/services/nar-operators';
import { computeChurnAnalysis } from '@/lib/services/nar-churn';
import { computeInsights } from '@/lib/services/nar-insights';
import { resolveOperators } from '@/lib/services/nar-operator-resolver';
import type {
  NarRow,
  NarFilters,
  NarBucketKey,
  NarExcludedAccount,
  NarSnapshot,
  NarSnapshotBucket,
  NarSnapshotStats,
  NarFilterType,
  NarExclusionReason,
} from '@/types/nar';

interface DataRow {
  account_id: string;
  account_name: string | null;
  plan_slug: string | null;
  partner_id: string | null;
  partner_type: string | null;
  country_code: string | null;
  week_count: number | null;
  month_count: number | null;
  conversation_tier: string | null;
  week_conversation_count: string | null;
  month_conversation_count: string | null;
  company_owner: string | null;
}

interface ExclusionRow {
  account_id: string;
  reason: NarExclusionReason;
  account_name: string | null;
  excluded_by_email: string | null;
  excluded_at: string;
  notes: string | null;
}

interface SnapshotRow {
  id: string;
  label: string;
  created_by_email: string | null;
  created_at: string;
  filter_type: NarFilterType;
  month_filter: number[] | null;
  week_filter: number[] | null;
  exclude_week_zero: boolean;
  upload_id: string | null;
  stats: NarSnapshotStats;
  buckets: NarSnapshotBucket[];
}

function mapRow(r: DataRow): NarRow {
  return {
    accountId: Number(r.account_id),
    accountName: r.account_name ?? '',
    planSlug: r.plan_slug ?? '',
    partnerId: r.partner_id ?? '',
    partnerType: r.partner_type ?? '',
    countryCode: r.country_code ?? '',
    weekCount: Number(r.week_count ?? 0),
    monthCount: Number(r.month_count ?? 0),
    conversationTier: Number(r.conversation_tier ?? 0),
    weekConversationCount: Number(r.week_conversation_count ?? 0),
    monthConversationCount: Number(r.month_conversation_count ?? 0),
    companyOwner: r.company_owner ?? '',
    raw: null,
  };
}

interface PostBody {
  uploadId?: string;
  filters?: NarFilters;
  bucketKey?: NarBucketKey;
}

export const POST = withAuth(async (request: NextRequest) => {
  try {
    const body = (await request.json().catch(() => ({}))) as PostBody;
    const filters: NarFilters = body.filters ?? {
      type: 'none', months: [], weeks: [], excludeWeekZero: true, excludeWithdrawn: true,
    };
    const bucketKey: NarBucketKey = body.bucketKey ?? 'direct_no_es';

    const uploadId = body.uploadId ?? await (async () => {
      const r = await pgQuery<{ id: string }>(`SELECT id FROM nar_uploads WHERE is_current = TRUE LIMIT 1`);
      return r.rows[0]?.id;
    })();
    if (!uploadId) throw new ApiError(404, 'No current NAR dataset uploaded.');

    const [rowsRes, exclusionsRes, operators, snapshotsRes] = await Promise.all([
      pgQuery<DataRow>(
        `SELECT account_id::text, account_name, plan_slug, partner_id, partner_type, country_code,
                week_count, month_count, conversation_tier,
                week_conversation_count, month_conversation_count, company_owner
         FROM nar_rows WHERE upload_id = $1`,
        [uploadId]
      ),
      pgQuery<ExclusionRow>(
        `SELECT account_id::text, reason, account_name, excluded_by_email, excluded_at, notes
         FROM nar_excluded_accounts`
      ),
      resolveOperators(),
      pgQuery<SnapshotRow>(
        `SELECT id, label, created_by_email, created_at, filter_type, month_filter, week_filter,
                exclude_week_zero, upload_id, stats, buckets
         FROM nar_snapshots ORDER BY created_at ASC`
      ),
    ]);

    const rows = rowsRes.rows.map(mapRow);
    const exclusions: NarExcludedAccount[] = exclusionsRes.rows.map(r => ({
      accountId: Number(r.account_id),
      reason: r.reason,
      accountName: r.account_name,
      excludedByEmail: r.excluded_by_email,
      excludedAt: r.excluded_at,
      notes: r.notes,
    }));
    const snapshots: NarSnapshot[] = snapshotsRes.rows.map(r => ({
      id: r.id,
      label: r.label,
      createdByEmail: r.created_by_email,
      createdAt: r.created_at,
      filterType: r.filter_type,
      monthFilter: r.month_filter ?? [],
      weekFilter: r.week_filter ?? [],
      excludeWeekZero: r.exclude_week_zero,
      uploadId: r.upload_id,
      stats: r.stats,
      buckets: r.buckets,
    }));

    const exclusionSets = buildExclusionSets(exclusions);
    const filteredRows = applyFilters(rows, filters, exclusionSets);
    const bucketAnalysis = computeBucketAnalysis(filteredRows, filters, exclusionSets);
    const weeklyTrend = computeWeeklyTrend(filteredRows, bucketKey, exclusionSets);
    const churnAnalysis = computeChurnAnalysis(filteredRows, operators, exclusionSets);
    const operatorsAnalysis = computeOperatorsAnalysis(filteredRows, operators, filters, exclusionSets);

    const insights = computeInsights({
      filteredRows,
      bucketAnalysis,
      churnAnalysis,
      operatorsAnalysis,
      weeklyTrend,
      operators,
      snapshots,
    });

    return createSuccessResponse({ data: insights });
  } catch (error) {
    return createErrorResponse(error);
  }
});
