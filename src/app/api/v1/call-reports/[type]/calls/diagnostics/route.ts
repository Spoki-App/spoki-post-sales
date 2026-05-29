import { NextRequest } from 'next/server';
import {
  authenticateRequest,
  createSuccessResponse,
  createErrorResponse,
  ApiError,
  type RouteHandlerContext,
} from '@/lib/api/middleware';
import { isCallType } from '@/lib/services/meeting-analysis';
import { assertAdmin } from '@/lib/services/call-reports';
import { listMatchFailures } from '@/lib/services/fathom-matcher';

// GET /api/v1/call-reports/[type]/calls/diagnostics?ids=123,456
// Returns the list of engagements that failed to match Fathom on the latest analysis attempt.
// Optional `ids` query param scopes the response to specific hubspotIds (useful for the table view).
export async function GET(request: NextRequest, context: RouteHandlerContext) {
  try {
    const auth = await authenticateRequest(request);
    await assertAdmin(auth);

    const params = await context.params;
    const type = params.type as string | undefined;
    if (!isCallType(type)) {
      throw new ApiError(400, "type must be 'activation' or 'training'");
    }

    const idsParam = request.nextUrl.searchParams.get('ids');
    const ids = idsParam
      ? idsParam.split(',').map(s => s.trim()).filter(Boolean)
      : undefined;

    const failures = await listMatchFailures(type, ids);
    return createSuccessResponse({ data: { failures, count: failures.length } });
  } catch (error) {
    return createErrorResponse(error);
  }
}
