import { NextRequest } from 'next/server';
import { withAuth, createSuccessResponse, createErrorResponse, ApiError, type AuthenticatedRequest, type RouteHandlerContext } from '@/lib/api/middleware';
import { pgQuery } from '@/lib/db/postgres';
import { getHubSpotClient } from '@/lib/hubspot/client';

export const POST = withAuth(async (_req: NextRequest, _auth: AuthenticatedRequest, context?: RouteHandlerContext) => {
  try {
    const params = await context?.params;
    const clientId = params?.id as string;
    if (!clientId) throw new ApiError(400, 'Missing client id');

    const clientRes = await pgQuery<{ hubspot_id: string; name: string }>(
      `SELECT hubspot_id, name FROM clients WHERE id = $1`,
      [clientId]
    );
    if (clientRes.rows.length === 0) throw new ApiError(404, 'Client not found');
    const { hubspot_id: hubspotId, name: clientName } = clientRes.rows[0];

    const goalsRes = await pgQuery<{
      title: string; description: string | null; status: string;
      mentioned_at: string | null; due_date: string | null;
    }>(
      `SELECT title, description, status, mentioned_at, due_date
       FROM client_goals WHERE client_id = $1
       ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'achieved' THEN 1 ELSE 2 END, mentioned_at DESC NULLS LAST`,
      [clientId]
    );

    if (goalsRes.rows.length === 0) throw new ApiError(400, 'No goals to sync');

    const statusIcon: Record<string, string> = { active: '🔵', achieved: '✅', abandoned: '⚪' };
    const now = new Date().toISOString().slice(0, 10);

    const lines = goalsRes.rows.map(g => {
      const icon = statusIcon[g.status] || '🔵';
      const date = g.mentioned_at ? ` (${g.mentioned_at})` : '';
      const desc = g.description ? `\n   ${g.description}` : '';
      return `${icon} ${g.title}${date}${desc}`;
    });

    const noteBody = `<h3>Obiettivi Cliente - ${clientName}</h3>
<p>Aggiornamento: ${now}</p>
<pre>${lines.join('\n\n')}</pre>`;

    const hs = getHubSpotClient();
    const noteId = await hs.createNoteOnCompany(hubspotId, noteBody);

    return createSuccessResponse({ data: { noteId, goalsCount: goalsRes.rows.length } });
  } catch (error) {
    return createErrorResponse(error);
  }
});
