import type { FathomMeeting } from '@/lib/services/fathom';
import { HUBSPOT_OWNERS } from '@/lib/config/owners';
import { pgQuery } from '@/lib/db/postgres';
import type { CallType } from '@/lib/services/meeting-analysis';

export interface EngagementForMatch {
  hubspot_id: string;
  meeting_title: string | null;
  occurred_at: string;
  owner_id: string | null;
  fathom_share_url: string | null;
}

export interface MatchResult {
  meeting: FathomMeeting | null;
  strategy:
    | 'share_url'
    | 'title_same_day'
    | 'title_loose_pm1'
    | 'recorded_by_same_day'
    | 'invitee_same_day'
    | 'recorded_by_pm1'
    | null;
  reasonCode: MatchFailureReason | null;
}

export type MatchFailureReason =
  | 'NO_FATHOM_URL'
  | 'NO_TRANSCRIPT'
  | 'NO_MATCH'
  | 'FATHOM_FETCH_FAILED'
  | 'NO_TITLE';

export const FAILURE_MESSAGES: Record<MatchFailureReason, string> = {
  NO_FATHOM_URL: 'Nessuna URL Fathom associata al meeting',
  NO_TRANSCRIPT: 'Trascrizione non disponibile su Fathom',
  NO_MATCH: 'Nessun meeting Fathom corrispondente',
  FATHOM_FETCH_FAILED: 'Errore nel recupero dei meeting da Fathom',
  NO_TITLE: 'Meeting senza titolo',
};

export function ownerEmailsFor(ownerId: string | null): string[] {
  if (!ownerId) return [];
  const entry = HUBSPOT_OWNERS[ownerId];
  if (!entry?.email) return [];
  const emails = [entry.email];
  const alias = entry.email.replace('@spoki.it', '@spoki.com');
  if (alias !== entry.email) emails.push(alias);
  return emails;
}

function normalizeTitle(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .toLowerCase()
    .normalize('NFKD')
    // strip emoji + symbols
    .replace(/[\p{Extended_Pictographic}\p{S}]/gu, ' ')
    // normalize separators and whitespace
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function dayDiff(a: Date, b: Date): number {
  const ms = Math.abs(
    new Date(a.toDateString()).getTime() - new Date(b.toDateString()).getTime(),
  );
  return Math.round(ms / 86_400_000);
}

/**
 * Strategy chain (in priority order):
 *  1. exact share_url match
 *  2. exact title + same calendar day
 *  3. normalized title (case/emoji insensitive) within +/- 1 day
 *  4. recorded_by email match + same day
 *  5. invitee email match + same day
 *  6. recorded_by email match within +/- 1 day (timezone slack)
 */
export function matchEngagement(
  eng: EngagementForMatch,
  meetings: FathomMeeting[],
  used: Set<number>,
): MatchResult {
  const engDate = new Date(eng.occurred_at);
  const engOwnerEmails = new Set(ownerEmailsFor(eng.owner_id).map(e => e.toLowerCase()));
  const normTitle = normalizeTitle(eng.meeting_title);

  const isFree = (m: FathomMeeting) => !used.has(m.recording_id);

  // 1. exact share_url
  if (eng.fathom_share_url) {
    const m = meetings.find(x => isFree(x) && x.share_url === eng.fathom_share_url);
    if (m) return { meeting: m, strategy: 'share_url', reasonCode: null };
  }

  // 2. exact title + same day
  if (eng.meeting_title) {
    const m = meetings.find(x => {
      if (!isFree(x)) return false;
      const t = x.meeting_title || x.title;
      return t === eng.meeting_title && dayDiff(new Date(x.created_at), engDate) === 0;
    });
    if (m) return { meeting: m, strategy: 'title_same_day', reasonCode: null };
  }

  // 3. normalized title within +/- 1 day
  if (normTitle) {
    const m = meetings.find(x => {
      if (!isFree(x)) return false;
      const t = normalizeTitle(x.meeting_title || x.title);
      if (!t) return false;
      if (t !== normTitle) return false;
      return dayDiff(new Date(x.created_at), engDate) <= 1;
    });
    if (m) return { meeting: m, strategy: 'title_loose_pm1', reasonCode: null };
  }

  // 4. recorded_by email same day
  if (engOwnerEmails.size > 0) {
    const m = meetings.find(x => {
      if (!isFree(x)) return false;
      if (dayDiff(new Date(x.created_at), engDate) !== 0) return false;
      const recEmail = x.recorded_by?.email?.toLowerCase();
      return recEmail ? engOwnerEmails.has(recEmail) : false;
    });
    if (m) return { meeting: m, strategy: 'recorded_by_same_day', reasonCode: null };
  }

  // 5. invitee email same day
  if (engOwnerEmails.size > 0) {
    const m = meetings.find(x => {
      if (!isFree(x)) return false;
      if (dayDiff(new Date(x.created_at), engDate) !== 0) return false;
      return x.calendar_invitees?.some(i => {
        const e = i.email?.toLowerCase();
        return e ? engOwnerEmails.has(e) : false;
      });
    });
    if (m) return { meeting: m, strategy: 'invitee_same_day', reasonCode: null };
  }

  // 6. recorded_by email within +/- 1 day
  if (engOwnerEmails.size > 0) {
    const m = meetings.find(x => {
      if (!isFree(x)) return false;
      if (dayDiff(new Date(x.created_at), engDate) > 1) return false;
      const recEmail = x.recorded_by?.email?.toLowerCase();
      return recEmail ? engOwnerEmails.has(recEmail) : false;
    });
    if (m) return { meeting: m, strategy: 'recorded_by_pm1', reasonCode: null };
  }

  return { meeting: null, strategy: null, reasonCode: 'NO_MATCH' };
}

export async function recordMatchFailure(
  hubspotId: string,
  type: CallType,
  reasonCode: MatchFailureReason,
): Promise<void> {
  const message = FAILURE_MESSAGES[reasonCode];
  await pgQuery(
    `INSERT INTO call_match_failures (engagement_hubspot_id, call_type, reason_code, reason_message)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (engagement_hubspot_id) DO UPDATE SET
       call_type = EXCLUDED.call_type,
       reason_code = EXCLUDED.reason_code,
       reason_message = EXCLUDED.reason_message,
       attempts = call_match_failures.attempts + 1,
       last_attempt_at = NOW()`,
    [hubspotId, type, reasonCode, message],
  );
}

export async function clearMatchFailure(hubspotId: string): Promise<void> {
  await pgQuery(`DELETE FROM call_match_failures WHERE engagement_hubspot_id = $1`, [hubspotId]);
}

export interface MatchFailureRow {
  hubspotId: string;
  callType: CallType;
  reasonCode: MatchFailureReason;
  reasonMessage: string;
  attempts: number;
  lastAttemptAt: string;
}

export async function listMatchFailures(
  type: CallType,
  hubspotIds?: string[],
): Promise<MatchFailureRow[]> {
  if (hubspotIds && hubspotIds.length === 0) return [];
  const params: unknown[] = [type];
  let where = `call_type = $1`;
  if (hubspotIds && hubspotIds.length > 0) {
    const placeholders = hubspotIds.map((_, i) => `$${i + 2}`).join(', ');
    where += ` AND engagement_hubspot_id IN (${placeholders})`;
    params.push(...hubspotIds);
  }
  const r = await pgQuery<{
    engagement_hubspot_id: string;
    call_type: CallType;
    reason_code: MatchFailureReason;
    reason_message: string;
    attempts: number;
    last_attempt_at: string;
  }>(
    `SELECT engagement_hubspot_id, call_type, reason_code, reason_message, attempts, last_attempt_at
       FROM call_match_failures
       WHERE ${where}
       ORDER BY last_attempt_at DESC`,
    params,
  );
  return r.rows.map(x => ({
    hubspotId: x.engagement_hubspot_id,
    callType: x.call_type,
    reasonCode: x.reason_code,
    reasonMessage: x.reason_message,
    attempts: x.attempts,
    lastAttemptAt: x.last_attempt_at,
  }));
}
