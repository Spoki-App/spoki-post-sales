import { config } from '@/lib/config';
import { getLogger } from '@/lib/logger';

const logger = getLogger('services:fathom');

const TIMEOUT_MS = 90_000;
const MAX_RETRIES = 2;

export interface FathomMeeting {
  title: string;
  meeting_title: string;
  url: string;
  share_url: string;
  created_at: string;
  scheduled_start_time: string | null;
  scheduled_end_time: string | null;
  recording_id: number;
  recording_start_time: string | null;
  recording_end_time: string | null;
  calendar_invitees: Array<{
    name: string;
    email: string;
    email_domain: string;
    is_external: boolean;
  }>;
  recorded_by: {
    name: string;
    email: string;
    email_domain: string;
    team: string | null;
  };
  transcript?: Array<{
    speaker: { display_name: string; matched_calendar_invitee_email: string | null };
    text: string;
    timestamp: string;
  }>;
  default_summary?: {
    template_name: string;
    markdown_formatted: string;
  };
  action_items?: unknown;
}

interface FathomListResponse {
  items: FathomMeeting[];
  limit: number | null;
  next_cursor: string | null;
}

async function fathomFetch<T>(path: string, params?: Record<string, string>, arrayParams?: Record<string, string[]>): Promise<T> {
  const { apiKey, baseUrl } = config.fathom;
  if (!apiKey) throw new Error('FATHOM_API_KEY not configured');

  const url = new URL(`${baseUrl}/external/v1${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v) url.searchParams.set(k, v);
    }
  }
  if (arrayParams) {
    for (const [k, values] of Object.entries(arrayParams)) {
      for (const v of values) {
        url.searchParams.append(`${k}[]`, v);
      }
    }
  }

  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const res = await fetch(url.toString(), {
        headers: { 'X-Api-Key': apiKey },
        signal: controller.signal,
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        // Server errors are retried; client errors fail fast.
        if (res.status >= 500 && attempt < MAX_RETRIES) {
          logger.warn('Fathom 5xx, will retry', { status: res.status, attempt: attempt + 1 });
          lastErr = new Error(`Fathom returned ${res.status}`);
          await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
          continue;
        }
        logger.error('Fathom API error', { status: res.status, detail: detail.slice(0, 300) });
        throw new Error(`Fathom returned ${res.status}`);
      }

      return (await res.json()) as T;
    } catch (err) {
      lastErr = err;
      const isAbort = err instanceof DOMException && err.name === 'AbortError';
      const isNetwork = err instanceof TypeError;
      if ((isAbort || isNetwork) && attempt < MAX_RETRIES) {
        logger.warn('Fathom transient error, retrying', {
          attempt: attempt + 1,
          reason: isAbort ? 'timeout' : 'network',
        });
        await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
        continue;
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Fathom request failed');
}

export interface ListMeetingsParams {
  createdAfter?: string;
  recordedBy?: string[];
  includeTranscript?: boolean;
  includeSummary?: boolean;
  cursor?: string;
}

export async function listMeetings(params?: ListMeetingsParams & { maxPages?: number }): Promise<FathomMeeting[]> {
  const all: FathomMeeting[] = [];
  let cursor = params?.cursor;
  const maxPages = params?.maxPages ?? 40;
  let page = 0;

  do {
    if (page > 0) await new Promise(r => setTimeout(r, 1100));

    const query: Record<string, string> = {};
    if (params?.createdAfter) query.created_after = params.createdAfter;
    if (params?.includeTranscript) query.include_transcript = 'true';
    if (params?.includeSummary) query.include_summary = 'true';
    if (cursor) query.cursor = cursor;

    const arrayQuery: Record<string, string[]> = {};
    if (params?.recordedBy?.length) {
      arrayQuery.recorded_by = params.recordedBy;
    }

    const res = await fathomFetch<FathomListResponse>('/meetings', query, arrayQuery);
    all.push(...res.items);
    cursor = res.next_cursor ?? undefined;
    page++;

    logger.info(`Fathom page ${page}: fetched ${res.items.length} meetings (total: ${all.length})`);
  } while (cursor && page < maxPages);

  return all;
}

export async function getMeetingWithTranscript(recordingId: string): Promise<FathomMeeting | null> {
  const res = await fathomFetch<FathomListResponse>('/meetings', {
    include_transcript: 'true',
    include_summary: 'true',
  });

  return res.items.find(m => String(m.recording_id) === recordingId) ?? null;
}

export async function listMeetingsByPage(params?: ListMeetingsParams & { limit?: number }): Promise<FathomListResponse> {
  const query: Record<string, string> = {};
  if (params?.createdAfter) query.created_after = params.createdAfter;
  if (params?.includeTranscript) query.include_transcript = 'true';
  if (params?.includeSummary) query.include_summary = 'true';
  if (params?.cursor) query.cursor = params.cursor;

  return fathomFetch<FathomListResponse>('/meetings', query);
}
