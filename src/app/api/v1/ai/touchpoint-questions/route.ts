import { NextRequest } from 'next/server';
import {
  withAuth,
  createSuccessResponse,
  createErrorResponse,
  ApiError,
  type AuthenticatedRequest,
} from '@/lib/api/middleware';
import { generateTouchpointQuestions } from '@/lib/services/touchpoint-questions';

export const POST = withAuth(async (request: NextRequest, _auth: AuthenticatedRequest) => {
  try {
    const body = (await request.json()) as {
      clientId?: string;
      type?: string;
      additionalContext?: string;
    };

    if (!body.clientId) throw new ApiError(400, 'Missing clientId');
    if (!body.type) throw new ApiError(400, 'Missing type');

    const result = await generateTouchpointQuestions({
      clientId: body.clientId,
      type: body.type,
      additionalContext: body.additionalContext,
    });

    return createSuccessResponse({ data: result });
  } catch (error) {
    return createErrorResponse(error, 'Failed to generate touchpoint questions');
  }
});
