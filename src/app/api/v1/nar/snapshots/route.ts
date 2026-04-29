import { NextRequest } from 'next/server';
import { withAuth, createSuccessResponse, createErrorResponse, ApiError, type AuthenticatedRequest } from '@/lib/api/middleware';
import { pgQuery } from '@/lib/db/postgres';
import type { NarSnapshot, NarSnapshotBucket, NarSnapshotStats, NarFilterType } from '@/types/nar';

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

function mapSnapshot(r: SnapshotRow): NarSnapshot {
  return {
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
  };
}

export const GET = withAuth(async () => {
  try {
    const res = await pgQuery<SnapshotRow>(
      `SELECT id, label, created_by_email, created_at, filter_type, month_filter, week_filter,
              exclude_week_zero, upload_id, stats, buckets
       FROM nar_snapshots ORDER BY created_at ASC`
    );
    return createSuccessResponse({ data: res.rows.map(mapSnapshot) });
  } catch (error) {
    return createErrorResponse(error);
  }
});

interface PostBody {
  label?: string;
  filterType?: NarFilterType;
  monthFilter?: number[];
  weekFilter?: number[];
  excludeWeekZero?: boolean;
  uploadId?: string | null;
  stats?: NarSnapshotStats;
  buckets?: NarSnapshotBucket[];
}

export const POST = withAuth(async (request: NextRequest, auth: AuthenticatedRequest) => {
  try {
    const body = (await request.json().catch(() => ({}))) as PostBody;
    if (!body.label || !body.stats || !Array.isArray(body.buckets)) {
      throw new ApiError(400, 'label, stats and buckets are required');
    }
    const filterType: NarFilterType = body.filterType ?? 'none';
    const insertRes = await pgQuery<{ id: string }>(
      `INSERT INTO nar_snapshots
         (label, created_by_email, filter_type, month_filter, week_filter, exclude_week_zero, upload_id, stats, buckets)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb)
       RETURNING id`,
      [
        body.label,
        auth.email ?? null,
        filterType,
        body.monthFilter ?? [],
        body.weekFilter ?? [],
        body.excludeWeekZero ?? true,
        body.uploadId ?? null,
        JSON.stringify(body.stats),
        JSON.stringify(body.buckets),
      ]
    );
    return createSuccessResponse({ data: { id: insertRes.rows[0].id } }, 201);
  } catch (error) {
    return createErrorResponse(error);
  }
});

export const DELETE = withAuth(async (request: NextRequest) => {
  try {
    const id = new URL(request.url).searchParams.get('id');
    if (!id) throw new ApiError(400, 'id query param required');
    await pgQuery('DELETE FROM nar_snapshots WHERE id = $1', [id]);
    return createSuccessResponse({ data: { removed: true } });
  } catch (error) {
    return createErrorResponse(error);
  }
});
