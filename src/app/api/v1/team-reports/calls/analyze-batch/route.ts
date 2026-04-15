import { NextRequest } from 'next/server';
import { authenticateRequest } from '@/lib/api/middleware';
import { isAdminEmail, HUBSPOT_OWNERS } from '@/lib/config/owners';
import { isConfigured } from '@/lib/config';
import { pgQuery } from '@/lib/db/postgres';
import { listMeetings } from '@/lib/services/fathom';
import { analyzeActivationCall } from '@/lib/services/meeting-analysis';
import { getLogger } from '@/lib/logger';

const logger = getLogger('api:team-reports:analyze-batch');

const MAX_CONCURRENCY = 2;
const encoder = new TextEncoder();

function sse(event: string, data: unknown): Uint8Array {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export async function POST(request: NextRequest) {
  let auth;
  try {
    auth = await authenticateRequest(request);
  } catch {
    return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!isAdminEmail(auth.email)) {
    return new Response(JSON.stringify({ success: false, error: 'Accesso riservato agli admin' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!isConfigured('fathom')) {
    return new Response(JSON.stringify({ success: false, error: 'Fathom non configurato' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let hubspotIds: string[];
  try {
    const body = await request.json();
    hubspotIds = body.hubspotIds;
    if (!Array.isArray(hubspotIds) || hubspotIds.length === 0) {
      throw new Error('hubspotIds must be a non-empty array');
    }
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: e instanceof Error ? e.message : 'Invalid body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const total = hubspotIds.length;

  const stream = new ReadableStream({
    async start(controller) {
      const counters = { analyzed: 0, failed: 0, skipped: 0, done: 0 };

      function emitProgress(hubspotId: string | null, status: string, error?: string) {
        counters.done++;
        controller.enqueue(sse('progress', {
          hubspotId, status, current: counters.done, total, ...(error ? { error } : {}),
        }));
      }

      try {
        const placeholders = hubspotIds.map((_, i) => `$${i + 1}`).join(', ');
        const engRows = await pgQuery<{
          hubspot_id: string;
          meeting_title: string | null;
          occurred_at: string;
          owner_id: string | null;
          fathom_share_url: string | null;
        }>(
          `SELECT hubspot_id,
                  raw_properties::jsonb->>'hs_meeting_title' AS meeting_title,
                  occurred_at,
                  owner_id,
                  raw_properties::jsonb->>'fathom_share_url' AS fathom_share_url
           FROM engagements
           WHERE hubspot_id IN (${placeholders})`,
          hubspotIds
        );

        const engagements = engRows.rows.filter(r => r.meeting_title);
        const engagementMap = new Map(engagements.map(e => [e.hubspot_id, e]));

        const missingIds = hubspotIds.filter(id => !engagementMap.has(id));
        counters.skipped += missingIds.length;

        for (const id of missingIds) {
          emitProgress(id, 'error', 'Engagement non trovato o senza titolo');
        }

        if (engagements.length === 0) {
          controller.enqueue(sse('complete', { analyzed: counters.analyzed, failed: counters.failed, skipped: counters.skipped }));
          controller.close();
          return;
        }

        const earliestDate = engagements.reduce((min, e) => {
          const d = new Date(e.occurred_at).getTime();
          return d < min ? d : min;
        }, Infinity);
        const searchDate = new Date(earliestDate - 2 * 24 * 60 * 60 * 1000).toISOString();

        const ownerIds = [...new Set(engagements.map(e => e.owner_id).filter(Boolean))] as string[];
        const ownerEmails = new Set<string>();
        for (const oid of ownerIds) {
          const entry = HUBSPOT_OWNERS[oid];
          if (entry?.email) {
            ownerEmails.add(entry.email);
            const alias = entry.email.replace('@spoki.it', '@spoki.com');
            if (alias !== entry.email) ownerEmails.add(alias);
          }
        }
        const recordedBy = ownerEmails.size > 0 ? [...ownerEmails] : undefined;

        logger.info('Batch: fetching Fathom meetings', { count: engagements.length, searchDate, recordedBy });
        controller.enqueue(sse('fetching', { status: 'fetching_transcripts' }));

        let fathomMeetings;
        try {
          fathomMeetings = await listMeetings({
            createdAfter: searchDate,
            includeTranscript: true,
            maxPages: 40,
            ...(recordedBy ? { recordedBy } : {}),
          });
        } catch (e) {
          logger.error('Batch: Fathom fetch failed', e);
          for (const eng of engagements) {
            counters.failed++;
            emitProgress(eng.hubspot_id, 'error', 'Errore nel recupero dei meeting da Fathom');
          }
          controller.enqueue(sse('complete', { analyzed: counters.analyzed, failed: counters.failed, skipped: counters.skipped }));
          controller.close();
          return;
        }

        logger.info(`Batch: fetched ${fathomMeetings.length} Fathom meetings for ${ownerEmails.size} owners`);

        type AnalysisJob = {
          hubspotId: string;
          meetingTitle: string;
          transcript: NonNullable<typeof fathomMeetings[0]['transcript']>;
          fathomUrl: string | undefined;
        };

        const jobs: AnalysisJob[] = [];
        const usedFathomIds = new Set<number>();

        for (const eng of engagements) {
          const engDate = new Date(eng.occurred_at).toDateString();
          const ownerEmail = eng.owner_id ? HUBSPOT_OWNERS[eng.owner_id]?.email?.toLowerCase() : null;
          const ownerAlias = ownerEmail?.replace('@spoki.it', '@spoki.com');

          const ownerEmails = new Set<string>();
          if (ownerEmail) ownerEmails.add(ownerEmail);
          if (ownerAlias && ownerAlias !== ownerEmail) ownerEmails.add(ownerAlias);

          // Strategy 1: match by fathom_share_url (most reliable)
          let match = eng.fathom_share_url
            ? fathomMeetings.find(m =>
                !usedFathomIds.has(m.recording_id) && m.share_url === eng.fathom_share_url
              )
            : undefined;

          // Strategy 2: exact title + same date
          if (!match) {
            match = fathomMeetings.find(m => {
              if (usedFathomIds.has(m.recording_id)) return false;
              const fathomTitle = m.meeting_title || m.title;
              if (fathomTitle !== eng.meeting_title) return false;
              return new Date(m.created_at).toDateString() === engDate;
            });
          }

          // Strategy 3: same date + recorded_by is the HubSpot owner
          if (!match && ownerEmails.size > 0) {
            match = fathomMeetings.find(m => {
              if (usedFathomIds.has(m.recording_id)) return false;
              if (new Date(m.created_at).toDateString() !== engDate) return false;
              const recEmail = m.recorded_by?.email?.toLowerCase();
              return recEmail ? ownerEmails.has(recEmail) : false;
            });
          }

          // Strategy 4: same date + owner in calendar invitees
          if (!match && ownerEmails.size > 0) {
            match = fathomMeetings.find(m => {
              if (usedFathomIds.has(m.recording_id)) return false;
              if (new Date(m.created_at).toDateString() !== engDate) return false;
              return m.calendar_invitees?.some(i => {
                const iEmail = i.email?.toLowerCase();
                return iEmail ? ownerEmails.has(iEmail) : false;
              });
            });
          }

          if (!match && eng.fathom_share_url) {
            logger.info('Batch: trying fallback without recorded_by filter', { hubspotId: eng.hubspot_id });
            try {
              const fallbackDate = new Date(new Date(eng.occurred_at).getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();
              const fallbackMeetings = await listMeetings({
                createdAfter: fallbackDate,
                includeTranscript: true,
                maxPages: 40,
              });
              match = fallbackMeetings.find(m => m.share_url === eng.fathom_share_url);
            } catch (e) {
              logger.warn('Batch: fallback Fathom fetch failed', { hubspotId: eng.hubspot_id, error: String(e) });
            }
          }

          if (!match || !match.transcript || match.transcript.length === 0) {
            const reason = match ? 'Trascrizione non disponibile' : 'Trascrizione non trovata su Fathom';
            logger.info('Batch: no match for engagement', {
              hubspotId: eng.hubspot_id,
              title: eng.meeting_title,
              date: engDate,
              ownerEmail,
              reason,
            });
            counters.skipped++;
            emitProgress(eng.hubspot_id, 'error', reason);
            continue;
          }

          usedFathomIds.add(match.recording_id);
          logger.info('Batch: matched engagement to Fathom meeting', {
            hubspotId: eng.hubspot_id,
            engTitle: eng.meeting_title,
            fathomTitle: match.meeting_title || match.title,
            date: engDate,
          });

          jobs.push({
            hubspotId: eng.hubspot_id,
            meetingTitle: eng.meeting_title!,
            transcript: match.transcript,
            fathomUrl: match.share_url || match.url,
          });
        }

        logger.info(`Batch: ${jobs.length} jobs to analyze, ${counters.skipped} skipped`);

        // Process jobs with concurrency limit using a shared job index.
        // JS is single-threaded for synchronous code, so `jobIdx++` is atomic.
        let jobIdx = 0;

        async function runWorker(): Promise<void> {
          while (jobIdx < jobs.length) {
            const job = jobs[jobIdx++];

            controller.enqueue(sse('progress', {
              hubspotId: job.hubspotId, status: 'analyzing', current: counters.done, total,
            }));

            try {
              const analysis = await analyzeActivationCall(job.transcript);
              counters.analyzed++;

              controller.enqueue(sse('result', {
                hubspotId: job.hubspotId,
                title: job.meetingTitle,
                fathomUrl: job.fathomUrl,
                analysis,
              }));
              emitProgress(job.hubspotId, 'done');
            } catch (e) {
              counters.failed++;
              logger.error(`Batch: analysis failed for ${job.hubspotId}`, e);
              emitProgress(
                job.hubspotId,
                'error',
                e instanceof Error ? e.message : 'Errore nell\'analisi',
              );
            }
          }
        }

        const workers = Array.from(
          { length: Math.min(MAX_CONCURRENCY, jobs.length) },
          () => runWorker()
        );
        await Promise.all(workers);

        controller.enqueue(sse('complete', {
          analyzed: counters.analyzed,
          failed: counters.failed,
          skipped: counters.skipped,
        }));
      } catch (e) {
        logger.error('Batch: unexpected error', e);
        controller.enqueue(sse('progress', {
          hubspotId: null, status: 'error', current: counters.done, total,
          error: 'Errore imprevisto nel batch',
        }));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
