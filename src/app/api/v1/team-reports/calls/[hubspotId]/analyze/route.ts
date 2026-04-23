import { NextRequest } from 'next/server';
import { type RouteHandlerContext, createErrorResponse, ApiError } from '@/lib/api/middleware';
import { handleSingleAnalyzeRequest } from '@/lib/services/call-reports';

// Legacy endpoint: always activation. Canonical: /api/v1/call-reports/activation/calls/[hubspotId]/analyze
export async function POST(request: NextRequest, context: RouteHandlerContext) {
  try {
    const params = await context.params;
    const hubspotId = params.hubspotId as string | undefined;
    if (!hubspotId) throw new ApiError(400, 'hubspotId is required');
    return await handleSingleAnalyzeRequest('activation', request, hubspotId);
  } catch (error) {
    return createErrorResponse(error);
  }
}
