import { NextRequest } from 'next/server';
import { withAuth, createSuccessResponse, createErrorResponse, ApiError, type AuthenticatedRequest, type RouteHandlerContext } from '@/lib/api/middleware';
import { pgQuery } from '@/lib/db/postgres';

export const GET = withAuth(async (req: NextRequest, _auth: AuthenticatedRequest, context?: RouteHandlerContext) => {
  try {
    const params = await context?.params;
    const id = params?.id as string;
    if (!id) throw new ApiError(400, 'Missing client id');

    const { searchParams } = new URL(req.url);
    const roleFilter = searchParams.get('role');

    const res = await pgQuery<{
      id: string; hubspot_id: string; email: string | null; first_name: string | null;
      last_name: string | null; phone: string | null; job_title: string | null;
      lifecycle_stage: string | null; owner_id: string | null; last_activity_at: string | null;
      communication_roles: string | null;
    }>(
      `SELECT id, hubspot_id, email, first_name, last_name, phone, job_title,
              lifecycle_stage, owner_id, last_activity_at, communication_roles
       FROM contacts
       WHERE client_id = $1
         ${roleFilter ? `AND (';' || COALESCE(communication_roles,'') || ';') LIKE '%' || ';' || $2 || ';' || '%'` : ''}
       ORDER BY last_activity_at DESC NULLS LAST`,
      roleFilter ? [id, roleFilter] : [id]
    );

    return createSuccessResponse({ data: res.rows.map(c => ({
      id: c.id, hubspotId: c.hubspot_id, email: c.email,
      firstName: c.first_name, lastName: c.last_name, phone: c.phone,
      jobTitle: c.job_title, lifecycleStage: c.lifecycle_stage,
      ownerId: c.owner_id, lastActivityAt: c.last_activity_at,
      communicationRoles: c.communication_roles
        ? c.communication_roles.split(';').filter(Boolean)
        : [],
    })) });
  } catch (error) {
    return createErrorResponse(error);
  }
});
