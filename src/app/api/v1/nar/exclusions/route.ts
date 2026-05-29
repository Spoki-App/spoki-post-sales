import { NextRequest } from 'next/server';
import { withAuth, createSuccessResponse, createErrorResponse, ApiError, type AuthenticatedRequest } from '@/lib/api/middleware';
import { pgQuery } from '@/lib/db/postgres';
import type { NarExcludedAccount, NarExclusionReason } from '@/types/nar';

interface ExclusionRow {
  account_id: string;
  reason: NarExclusionReason;
  account_name: string | null;
  excluded_by_email: string | null;
  excluded_at: string;
  notes: string | null;
}

function mapExclusion(r: ExclusionRow): NarExcludedAccount {
  return {
    accountId: Number(r.account_id),
    reason: r.reason,
    accountName: r.account_name,
    excludedByEmail: r.excluded_by_email,
    excludedAt: r.excluded_at,
    notes: r.notes,
  };
}

export const GET = withAuth(async (request: NextRequest) => {
  try {
    const reason = new URL(request.url).searchParams.get('reason') as NarExclusionReason | null;
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (reason) {
      conditions.push(`reason = $${params.length + 1}`);
      params.push(reason);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const res = await pgQuery<ExclusionRow>(
      `SELECT account_id::text, reason, account_name, excluded_by_email, excluded_at, notes
       FROM nar_excluded_accounts ${where} ORDER BY excluded_at DESC`,
      params
    );
    return createSuccessResponse({ data: res.rows.map(mapExclusion) });
  } catch (error) {
    return createErrorResponse(error);
  }
});

interface PostBody {
  accountId?: number;
  reason?: NarExclusionReason;
  accountName?: string | null;
  notes?: string | null;
}

export const POST = withAuth(async (request: NextRequest, auth: AuthenticatedRequest) => {
  try {
    const body = (await request.json().catch(() => ({}))) as PostBody;
    if (!body.accountId || !body.reason || (body.reason !== 'withdrawn' && body.reason !== 'direct_exclusion')) {
      throw new ApiError(400, 'accountId and valid reason are required');
    }
    await pgQuery(
      `INSERT INTO nar_excluded_accounts (account_id, reason, account_name, excluded_by_email, notes)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (account_id, reason) DO UPDATE SET
         account_name = COALESCE(EXCLUDED.account_name, nar_excluded_accounts.account_name),
         excluded_by_email = EXCLUDED.excluded_by_email,
         notes = EXCLUDED.notes,
         excluded_at = NOW()`,
      [body.accountId, body.reason, body.accountName ?? null, auth.email ?? null, body.notes ?? null]
    );
    return createSuccessResponse({ data: { added: true } }, 201);
  } catch (error) {
    return createErrorResponse(error);
  }
});

export const DELETE = withAuth(async (request: NextRequest) => {
  try {
    const url = new URL(request.url);
    const accountId = Number(url.searchParams.get('accountId') ?? '');
    const reason = url.searchParams.get('reason') as NarExclusionReason | null;
    if (!accountId || !reason) {
      throw new ApiError(400, 'accountId and reason query params required');
    }
    await pgQuery(
      `DELETE FROM nar_excluded_accounts WHERE account_id = $1 AND reason = $2`,
      [accountId, reason]
    );
    return createSuccessResponse({ data: { removed: true } });
  } catch (error) {
    return createErrorResponse(error);
  }
});
