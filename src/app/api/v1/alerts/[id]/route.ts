import { NextRequest } from 'next/server';
import { withAuth, createSuccessResponse, createErrorResponse, ApiError, type AuthenticatedRequest, type RouteHandlerContext } from '@/lib/api/middleware';
import { pgQuery } from '@/lib/db/postgres';

export const PATCH = withAuth(async (request: NextRequest, auth: AuthenticatedRequest, context?: RouteHandlerContext) => {
  try {
    const params = await context?.params;
    const id = params?.id as string;
    if (!id) throw new ApiError(400, 'Missing alert id');

    const body = await request.json() as { resolved?: boolean };

    if (body.resolved) {
      const res = await pgQuery(
        `UPDATE alerts SET resolved = true, resolved_at = NOW() WHERE id = $1 RETURNING *`,
        [id]
      );
      if (res.rows.length === 0) throw new ApiError(404, 'Alert not found');
      return createSuccessResponse({ data: res.rows[0] });
    }

    // Mark as read
    const res = await pgQuery(
      `UPDATE alerts
       SET read_by = array_append(read_by, $2)
       WHERE id = $1 AND NOT ($2 = ANY(read_by))
       RETURNING *`,
      [id, auth.email ?? auth.userId]
    );

    return createSuccessResponse({ data: res.rows[0] ?? null });
  } catch (error) {
    return createErrorResponse(error);
  }
});
