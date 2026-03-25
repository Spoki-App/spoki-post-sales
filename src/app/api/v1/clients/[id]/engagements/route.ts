import { NextRequest } from 'next/server';
import { withAuth, createSuccessResponse, createErrorResponse, ApiError, type AuthenticatedRequest, type RouteHandlerContext } from '@/lib/api/middleware';
import { pgQuery } from '@/lib/db/postgres';

export const GET = withAuth(async (_req: NextRequest, _auth: AuthenticatedRequest, context?: RouteHandlerContext) => {
  try {
    const params = await context?.params;
    const id = params?.id as string;
    if (!id) throw new ApiError(400, 'Missing client id');

    const res = await pgQuery<{
      id: string; hubspot_id: string; type: string; occurred_at: string;
      owner_id: string | null; title: string | null;
    }>(
      `SELECT id, hubspot_id, type, occurred_at, owner_id, title
       FROM engagements WHERE client_id = $1 ORDER BY occurred_at DESC LIMIT 100`,
      [id]
    );

    return createSuccessResponse({ data: res.rows.map(e => ({
      id: e.id, hubspotId: e.hubspot_id, type: e.type,
      occurredAt: e.occurred_at, ownerId: e.owner_id, title: e.title,
    })) });
  } catch (error) {
    return createErrorResponse(error);
  }
});
