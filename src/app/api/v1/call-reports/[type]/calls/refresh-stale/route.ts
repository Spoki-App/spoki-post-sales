import { NextRequest } from 'next/server';
import {
  authenticateRequest,
  createSuccessResponse,
  createErrorResponse,
  ApiError,
  type RouteHandlerContext,
} from '@/lib/api/middleware';
import { isCallType, getCallConfig } from '@/lib/services/meeting-analysis';
import { assertAdmin } from '@/lib/services/call-reports';
import { pgQuery } from '@/lib/db/postgres';

// Returns the engagement_hubspot_ids of analyses whose prompt_version is older than the
// current one for the given call type. The caller can then DELETE + re-analyze them.
export async function GET(request: NextRequest, context: RouteHandlerContext) {
  try {
    const auth = await authenticateRequest(request);
    await assertAdmin(auth);

    const params = await context.params;
    const type = params.type as string | undefined;
    if (!isCallType(type)) {
      throw new ApiError(400, "type must be 'activation' or 'training'");
    }

    const cfg = await getCallConfig(type);
    const r = await pgQuery<{ engagement_hubspot_id: string; prompt_version: string }>(
      `SELECT engagement_hubspot_id, prompt_version
         FROM call_analyses
         WHERE call_type = $1
           AND prompt_version <> $2`,
      [type, cfg.promptVersion],
    );

    return createSuccessResponse({
      data: {
        currentPromptVersion: cfg.promptVersion,
        staleHubspotIds: r.rows.map(x => x.engagement_hubspot_id),
        count: r.rows.length,
      },
    });
  } catch (error) {
    return createErrorResponse(error);
  }
}

// Bulk-delete stale analyses; returns how many were removed.
export async function DELETE(request: NextRequest, context: RouteHandlerContext) {
  try {
    const auth = await authenticateRequest(request);
    await assertAdmin(auth);

    const params = await context.params;
    const type = params.type as string | undefined;
    if (!isCallType(type)) {
      throw new ApiError(400, "type must be 'activation' or 'training'");
    }

    const cfg = await getCallConfig(type);
    const res = await pgQuery(
      `DELETE FROM call_analyses
        WHERE call_type = $1
          AND prompt_version <> $2`,
      [type, cfg.promptVersion],
    );

    return createSuccessResponse({ data: { removed: res.rowCount ?? 0 } });
  } catch (error) {
    return createErrorResponse(error);
  }
}
