import { NextRequest } from 'next/server';
import { withAuth, createSuccessResponse, createErrorResponse, ApiError, type AuthenticatedRequest } from '@/lib/api/middleware';
import {
  resolveOperators,
  upsertOperatorOverridesFromCsv,
  upsertOperatorOverrideManual,
  type OperatorUpsertInput,
} from '@/lib/services/nar-operator-resolver';
import { parseOperatorsCsv } from '@/lib/services/nar-csv';
import { getLogger } from '@/lib/logger';

const logger = getLogger('api:nar:operators');

export const GET = withAuth(async () => {
  try {
    const data = await resolveOperators();
    return createSuccessResponse({ data });
  } catch (error) {
    return createErrorResponse(error);
  }
});

interface PostBody {
  csv?: string;
  rows?: OperatorUpsertInput[];
}

export const POST = withAuth(async (request: NextRequest, auth: AuthenticatedRequest) => {
  try {
    const body = (await request.json().catch(() => ({}))) as PostBody;
    let rows: OperatorUpsertInput[] = [];
    if (Array.isArray(body.rows) && body.rows.length > 0) {
      rows = body.rows;
    } else if (typeof body.csv === 'string' && body.csv.trim().length > 0) {
      rows = parseOperatorsCsv(body.csv).map(r => ({
        accountId: r.accountId,
        operatorName: r.operator,
        accountName: r.accountName,
        partnerType: r.partnerType,
        plan: r.plan,
        status: r.status,
      }));
    } else {
      throw new ApiError(400, 'Provide either { csv: string } or { rows: OperatorUpsertInput[] }');
    }
    if (rows.length === 0) {
      throw new ApiError(400, 'Parsed operators dataset is empty.');
    }
    const written = await upsertOperatorOverridesFromCsv(rows, auth.email ?? null);
    logger.info('Operators bulk upsert', { count: written, by: auth.email });
    return createSuccessResponse({ data: { written } }, 201);
  } catch (error) {
    return createErrorResponse(error);
  }
});

interface PatchBody {
  accountId?: number;
  operatorName?: string;
  accountName?: string | null;
  partnerType?: string | null;
  plan?: string | null;
  status?: string | null;
}

export const PATCH = withAuth(async (request: NextRequest, auth: AuthenticatedRequest) => {
  try {
    const body = (await request.json().catch(() => ({}))) as PatchBody;
    if (!body.accountId || !body.operatorName) {
      throw new ApiError(400, 'accountId and operatorName are required');
    }
    await upsertOperatorOverrideManual(
      {
        accountId: Number(body.accountId),
        operatorName: body.operatorName,
        accountName: body.accountName,
        partnerType: body.partnerType,
        plan: body.plan,
        status: body.status,
      },
      auth.email ?? null
    );
    return createSuccessResponse({ data: { updated: true } });
  } catch (error) {
    return createErrorResponse(error);
  }
});
