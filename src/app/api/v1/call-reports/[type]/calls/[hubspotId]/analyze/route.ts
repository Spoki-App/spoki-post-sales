import { NextRequest } from 'next/server';
import { createErrorResponse, ApiError, type RouteHandlerContext } from '@/lib/api/middleware';
import { isCallType } from '@/lib/services/meeting-analysis';
import { handleSingleAnalyzeRequest } from '@/lib/services/call-reports';

export async function POST(request: NextRequest, context: RouteHandlerContext) {
  try {
    const params = await context.params;
    const type = params.type as string | undefined;
    const hubspotId = params.hubspotId as string | undefined;
    if (!isCallType(type)) {
      throw new ApiError(400, "type must be 'activation' or 'training'");
    }
    if (!hubspotId) throw new ApiError(400, 'hubspotId is required');
    return await handleSingleAnalyzeRequest(type, request, hubspotId);
  } catch (error) {
    return createErrorResponse(error);
  }
}
