import { NextRequest } from 'next/server';
import { createErrorResponse, ApiError, type RouteHandlerContext } from '@/lib/api/middleware';
import { isCallType } from '@/lib/services/meeting-analysis';
import { handleListRequest } from '@/lib/services/call-reports';

export async function GET(request: NextRequest, context: RouteHandlerContext) {
  try {
    const params = await context.params;
    const type = params.type as string | undefined;
    if (!isCallType(type)) {
      throw new ApiError(400, "type must be 'activation' or 'training'");
    }
    return await handleListRequest(type, request);
  } catch (error) {
    return createErrorResponse(error);
  }
}
