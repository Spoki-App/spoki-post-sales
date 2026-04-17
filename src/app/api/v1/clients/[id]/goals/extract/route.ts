import { NextRequest } from 'next/server';
import { withAuth, createSuccessResponse, createErrorResponse, ApiError, type AuthenticatedRequest, type RouteHandlerContext } from '@/lib/api/middleware';
import { extractGoalsForClient } from '@/lib/services/goal-extraction';

export const POST = withAuth(async (_req: NextRequest, _auth: AuthenticatedRequest, context?: RouteHandlerContext) => {
  try {
    const params = await context?.params;
    const clientId = params?.id as string;
    if (!clientId) throw new ApiError(400, 'Missing client id');

    const result = await extractGoalsForClient(clientId);
    return createSuccessResponse({
      data: {
        extracted: result.inserted,
        engagementCount: result.engagementRows,
        contextLines: result.contextLines,
        hint: result.hint,
      },
    });
  } catch (error) {
    return createErrorResponse(error);
  }
});
