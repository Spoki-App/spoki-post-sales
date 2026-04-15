import { NextRequest } from 'next/server';
import { withAuth, createSuccessResponse, createErrorResponse, ApiError, type RouteHandlerContext } from '@/lib/api/middleware';
import { isAdminEmail, HUBSPOT_OWNERS } from '@/lib/config/owners';
import { isConfigured } from '@/lib/config';
import { pgQuery } from '@/lib/db/postgres';
import { listMeetings } from '@/lib/services/fathom';
import { analyzeActivationCall } from '@/lib/services/meeting-analysis';

export const POST = withAuth(async (_request: NextRequest, auth, context?: RouteHandlerContext) => {
  if (!isAdminEmail(auth.email)) {
    throw new ApiError(403, 'Accesso riservato agli admin');
  }
  if (!isConfigured('fathom')) {
    throw new ApiError(400, 'Fathom non configurato');
  }

  const params = await context!.params;
  const hubspotId = params.hubspotId as string;
  if (!hubspotId) throw new ApiError(400, 'hubspotId is required');

  try {
    const engRow = await pgQuery<{
      meeting_title: string | null;
      occurred_at: string;
      owner_id: string | null;
      fathom_share_url: string | null;
      meeting_notes: string | null;
    }>(
      `SELECT
        raw_properties::jsonb->>'hs_meeting_title' AS meeting_title,
        occurred_at,
        owner_id,
        raw_properties::jsonb->>'fathom_share_url' AS fathom_share_url,
        raw_properties::jsonb->>'hs_internal_meeting_notes' AS meeting_notes
      FROM engagements
      WHERE hubspot_id = $1`,
      [hubspotId]
    );

    if (engRow.rows.length === 0) {
      throw new ApiError(404, 'Engagement non trovato nel DB');
    }

    const { meeting_title, occurred_at, owner_id, fathom_share_url, meeting_notes } = engRow.rows[0];
    if (!meeting_title) throw new ApiError(400, 'Meeting senza titolo');

    // Try to get Fathom URL from fathom_share_url field or extract from meeting notes
    let actualFathomUrl = fathom_share_url;
    if (!actualFathomUrl && meeting_notes) {
      const fathomUrlMatch = meeting_notes.match(/https:\/\/fathom\.video\/share\/[a-zA-Z0-9_-]+/);
      actualFathomUrl = fathomUrlMatch ? fathomUrlMatch[0] : null;
    }

    if (!actualFathomUrl) {
      throw new ApiError(400, 'Nessuna registrazione Fathom associata a questo meeting. Verifica che il meeting sia stato registrato con Fathom.');
    }

    const ownerEntry = owner_id ? HUBSPOT_OWNERS[owner_id] : null;
    const ownerEmails = ownerEntry ? [ownerEntry.email] : [];
    const alias = ownerEntry?.email.replace('@spoki.it', '@spoki.com');
    if (alias && alias !== ownerEntry?.email) ownerEmails.push(alias);

    const meetingDate = new Date(occurred_at);
    const searchAfter = new Date(meetingDate.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();

    let match = null;

    for (const email of ownerEmails.length > 0 ? ownerEmails : [undefined]) {
      if (match) break;
      const meetings = await listMeetings({
        createdAfter: searchAfter,
        includeTranscript: true,
        maxPages: 30,
        ...(email ? { recordedBy: [email] } : {}),
      });

      match = meetings.find(m => m.share_url === actualFathomUrl) ?? null;
    }

    if (!match) {
      const fallbackMeetings = await listMeetings({
        createdAfter: searchAfter,
        includeTranscript: true,
        maxPages: 40,
      });
      match = fallbackMeetings.find(m => m.share_url === actualFathomUrl) ?? null;
    }

    if (!match) {
      throw new ApiError(404, 'Trascrizione non trovata su Fathom. Il meeting potrebbe essere troppo vecchio o la registrazione non e\' piu\' disponibile.');
    }

    if (!match.transcript || match.transcript.length === 0) {
      throw new ApiError(400, 'Trascrizione non disponibile su Fathom per questo meeting');
    }

    const analysis = await analyzeActivationCall(match.transcript);

    return createSuccessResponse({
      data: {
        hubspotId,
        title: meeting_title,
        fathomUrl: actualFathomUrl,
        analysis,
      },
    });
  } catch (error) {
    return createErrorResponse(error);
  }
});
