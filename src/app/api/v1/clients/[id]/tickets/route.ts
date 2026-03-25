import { NextRequest } from 'next/server';
import { withAuth, createSuccessResponse, createErrorResponse, ApiError, type AuthenticatedRequest, type RouteHandlerContext } from '@/lib/api/middleware';
import { pgQuery } from '@/lib/db/postgres';

export const GET = withAuth(async (_req: NextRequest, _auth: AuthenticatedRequest, context?: RouteHandlerContext) => {
  try {
    const params = await context?.params;
    const id = params?.id as string;
    if (!id) throw new ApiError(400, 'Missing client id');

    const res = await pgQuery<{
      id: string; hubspot_id: string; subject: string | null; content: string | null;
      status: string | null; priority: string | null; pipeline: string | null;
      owner_id: string | null; opened_at: string | null; closed_at: string | null;
      last_modified_at: string | null;
    }>(
      `SELECT id, hubspot_id, subject, content, status, priority, pipeline,
              owner_id, opened_at, closed_at, last_modified_at
       FROM tickets WHERE client_id = $1 ORDER BY opened_at DESC NULLS LAST`,
      [id]
    );

    return createSuccessResponse({ data: res.rows.map(t => ({
      id: t.id, hubspotId: t.hubspot_id, subject: t.subject, content: t.content,
      status: t.status, priority: t.priority, pipeline: t.pipeline,
      ownerId: t.owner_id, openedAt: t.opened_at, closedAt: t.closed_at,
      lastModifiedAt: t.last_modified_at,
    })) });
  } catch (error) {
    return createErrorResponse(error);
  }
});
