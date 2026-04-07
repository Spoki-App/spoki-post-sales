import { NextRequest } from 'next/server';
import { withAuth, createSuccessResponse, createErrorResponse, ApiError } from '@/lib/api/middleware';
import { getHubSpotClient } from '@/lib/hubspot/client';

export const POST = withAuth(async (request: NextRequest) => {
  try {
    const body = await request.json() as {
      workflowId?: string;
      objectId?: string;
      objectType?: 'contacts' | 'companies';
    };

    if (!body.workflowId || !body.objectId || !body.objectType) {
      throw new ApiError(400, 'Missing required fields: workflowId, objectId, objectType');
    }

    if (!['contacts', 'companies'].includes(body.objectType)) {
      throw new ApiError(400, 'objectType must be "contacts" or "companies"');
    }

    const hs = getHubSpotClient();
    await hs.enrollInWorkflow(body.workflowId, body.objectId, body.objectType);

    return createSuccessResponse({ enrolled: true }, 200);
  } catch (error) {
    return createErrorResponse(error, 'Failed to enroll in workflow');
  }
});
