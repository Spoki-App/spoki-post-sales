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
      owner_id: string | null; title: string | null; raw_properties: string;
    }>(
      `SELECT e.id, e.hubspot_id, e.type, e.occurred_at, e.owner_id, e.title, e.raw_properties::text
       FROM engagements e
       LEFT JOIN contacts co ON e.contact_id = co.id
       WHERE e.client_id = $1 OR co.client_id = $1
       ORDER BY e.occurred_at DESC LIMIT 100`,
      [id]
    );

    return createSuccessResponse({ data: res.rows.map(e => {
      const rp = JSON.parse(e.raw_properties || '{}');
      return {
        id: e.id, hubspotId: e.hubspot_id, type: e.type,
        occurredAt: e.occurred_at, ownerId: e.owner_id, title: e.title,
        emailFrom: rp.hs_email_from_firstname ? `${rp.hs_email_from_firstname} ${rp.hs_email_from_lastname ?? ''}`.trim() : null,
        emailTo: rp.hs_email_to_firstname ? `${rp.hs_email_to_firstname} ${rp.hs_email_to_lastname ?? ''}`.trim() : null,
        callDirection: rp.hs_call_direction ?? null,
        callDisposition: rp.hs_call_disposition ?? null,
        callTitle: rp.hs_call_title ?? null,
        taskSubject: rp.hs_task_subject ?? null,
        taskStatus: rp.hs_task_status ?? null,
        taskPriority: rp.hs_task_priority ?? null,
        taskType: rp.hs_task_type ?? null,
      };
    }) });
  } catch (error) {
    return createErrorResponse(error);
  }
});
