import { NextRequest } from 'next/server';
import { withAuth, createSuccessResponse, createErrorResponse, ApiError, type AuthenticatedRequest, type RouteHandlerContext } from '@/lib/api/middleware';
import { pgQuery } from '@/lib/db/postgres';

function classifyNote(body: string): string | null {
  const t = body.replace(/<[^>]*>/g, '').trim();
  if (/^playbook:\s*followup\s*call\s*2/i.test(t)) return 'Followup Call 2';
  if (/^playbook:\s*followup\s*call\s*1/i.test(t)) return 'Followup Call 1';
  if (/^playbook:\s*training/i.test(t)) return 'Training Call';
  if (/^playbook:\s*activation/i.test(t)) return 'Activation Call';
  if (/^playbook\s+onboarding\s+post\s*training/i.test(t)) return 'Post Training';
  if (/^playbook\s+onboarding\s+post\s*activation/i.test(t)) return 'Post Activation';
  if (/handoff/i.test(t)) return 'Handoff Sales \u2192 CS';
  if (/^playbook/i.test(t)) return 'Playbook';
  return null;
}

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
       WHERE e.client_id = $1::uuid
          OR co.client_id = $1::uuid
          OR EXISTS (
            SELECT 1 FROM clients c
            WHERE c.id = $1::uuid
              AND NULLIF(BTRIM(c.hubspot_id::text), '') IS NOT NULL
              AND NULLIF(BTRIM(e.company_hubspot_id::text), '') IS NOT NULL
              AND BTRIM(e.company_hubspot_id::text) = BTRIM(c.hubspot_id::text)
          )
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
        noteCategory: e.type === 'NOTE' ? classifyNote(rp.hs_note_body || rp.hs_body_preview || '') : null,
      };
    }) });
  } catch (error) {
    return createErrorResponse(error);
  }
});
