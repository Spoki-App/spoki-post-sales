import { NextRequest } from 'next/server';
import { withAuth } from '@/lib/api/middleware';
import { createSuccessResponse, createErrorResponse } from '@/lib/api/middleware';
import { getHubSpotClient } from '@/lib/hubspot/client';

export const GET = withAuth(async (_request: NextRequest) => {
  try {
    const hs = getHubSpotClient();
    const workflows = await hs.getWorkflows();
    return createSuccessResponse({ data: workflows });
  } catch (error) {
    return createErrorResponse(error, 'Failed to fetch workflows');
  }
});
