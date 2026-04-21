import { NextRequest } from 'next/server';
import {
  authenticateRequest,
  createSuccessResponse,
  createErrorResponse,
  ApiError,
  type RouteHandlerContext,
} from '@/lib/api/middleware';
import { isCallType } from '@/lib/services/meeting-analysis';
import { assertAdmin, deleteAnalysis } from '@/lib/services/call-reports';

export async function DELETE(request: NextRequest, context: RouteHandlerContext) {
  try {
    const auth = await authenticateRequest(request);
    await assertAdmin(auth);

    const params = await context.params;
    const type = params.type as string | undefined;
    const hubspotId = params.hubspotId as string | undefined;

    if (!isCallType(type)) {
      throw new ApiError(400, "type must be 'activation' or 'training'");
    }
    if (!hubspotId) throw new ApiError(400, 'hubspotId is required');

    const removed = await deleteAnalysis(type, hubspotId);
    return createSuccessResponse({ data: { removed } });
  } catch (error) {
    return createErrorResponse(error);
  }
}
