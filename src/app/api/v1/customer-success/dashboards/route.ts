import { NextRequest } from 'next/server';
import {
  withAuth,
  createSuccessResponse,
  createErrorResponse,
  type AuthenticatedRequest,
} from '@/lib/api/middleware';
import { CS_HUBSPOT_DASHBOARDS } from '@/lib/config/cs-hubspot-dashboards';
import { requireCsOwner } from '@/lib/customer-success/require-cs-owner';

export const GET = withAuth(async (_req: NextRequest, auth: AuthenticatedRequest) => {
  try {
    const owner = requireCsOwner(auth);
    const dashboards = CS_HUBSPOT_DASHBOARDS[owner.id] ?? [];
    return createSuccessResponse({
      data: {
        owner: { id: owner.id, name: `${owner.firstName} ${owner.lastName}` },
        dashboards,
      },
    });
  } catch (error) {
    return createErrorResponse(error);
  }
});
