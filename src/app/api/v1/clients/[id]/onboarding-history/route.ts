import { NextRequest } from 'next/server';
import { withAuth, createSuccessResponse, createErrorResponse, ApiError, type AuthenticatedRequest, type RouteHandlerContext } from '@/lib/api/middleware';
import { pgQuery } from '@/lib/db/postgres';
import { getHubSpotClient } from '@/lib/hubspot/client';
import { SALES_PIPELINE } from '@/lib/config/deal-pipelines';

const HAPPY_PATH: { id: string; label: string }[] = [
  { id: '1', label: 'Deal Won' },
  { id: '1011192836', label: 'Activation Call Booked' },
  { id: '2', label: 'Activated' },
  { id: '2071331018', label: 'Training Booked' },
  { id: '3071245506', label: 'Training Done' },
  { id: '1709021391', label: 'Follow up Call' },
  { id: '2724350144', label: 'Follow up Call 2' },
  { id: '2724350145', label: 'Follow up Call 3' },
  { id: '1005076483', label: 'Post Onboarding' },
];

const ALL_STAGES: Record<string, string> = {
  '1': 'Deal Won', '1011192836': 'Activation Call Booked', '2702656701': 'Activation problems',
  '2712273122': 'Activation Failed', '2': 'Activated', '2071331018': 'Training Booked',
  '3071245506': 'Training Done', '4013788352': '10% Usage', '1709021391': 'Follow up Call',
  '2724350144': 'Follow up Call 2', '2724350145': 'Follow up Call 3', '1004962561': 'Utilizzo 60%',
  '1004887980': 'Never Activated', '1005076483': 'Post Onboarding', '4524518615': 'Free',
  '4524518616': 'Withdrawal',
};

const ONBOARDING_STAGE_IDS = new Set(Object.keys(ALL_STAGES));
const HAPPY_PATH_IDS = new Set(HAPPY_PATH.map(s => s.id));

/**
 * HubSpot activity types (hs_activity_type) that we map 1:1 to onboarding pipeline stages.
 * Multiple meetings sharing the same activity type on the same company form a "reschedule
 * chain" (HubSpot creates a new meeting when a lead reschedules via public booking link,
 * leaving the old one with outcome=SCHEDULED). Only the canonical meeting of each chain
 * is used for dating the stage.
 */
// "date" = which timestamp of the canonical meeting we surface:
//   'start'  → hs_meeting_start_time (when the meeting occurred / will occur)
//   'created' → hs_createdate       (when the meeting was booked in HubSpot)
// "Booked" stages use 'created' so the UI shows when the meeting was actually scheduled,
// not when it was held (otherwise "Training Booked" and "Training Done" would share the
// same date for single-session trainings).
const ACTIVITY_TYPE_TO_STAGE = {
  activationCallBooked: { stageId: '1011192836', activityType: 'Activation Call',        date: 'start'   as const },
  trainingBooked:       { stageId: '2071331018', activityType: 'Training Call',          date: 'created' as const },
  trainingDone:         { stageId: '3071245506', activityType: 'Training Call',          date: 'start'   as const },
  followupCall1:        { stageId: '1709021391', activityType: 'Onboarding - Followup',   date: 'start'   as const },
  followupCall2:        { stageId: '2724350144', activityType: 'Onboarding - Followup 2', date: 'start'   as const },
  followupCall3:        { stageId: '2724350145', activityType: 'Onboarding - Followup 3', date: 'start'   as const },
} as const;

type MeetingRow = {
  hubspot_id: string;
  occurred_at: string;
  raw_properties: Record<string, unknown> | null;
};

interface Meeting {
  id: string;
  activityType: string | null;
  startTime: string | null;
  createdAt: string | null;
  outcome: string | null;
}

function toMeeting(row: MeetingRow): Meeting {
  const p = row.raw_properties ?? {};
  const activity = (p['hs_activity_type'] as string | undefined) ?? null;
  return {
    id: row.hubspot_id,
    activityType: activity,
    startTime: (p['hs_meeting_start_time'] as string | undefined) ?? row.occurred_at ?? null,
    createdAt: (p['hs_createdate'] as string | undefined) ?? null,
    outcome: (p['hs_meeting_outcome'] as string | undefined) ?? null,
  };
}

/**
 * Pick the canonical meeting for a given activity type.
 * - Excludes explicitly CANCELED / NO_SHOW meetings.
 * - If any meeting is COMPLETED, we prefer the most recent COMPLETED one.
 * - Otherwise, HubSpot creates a new meeting when a lead reschedules via public link
 *   (leaving the old one SCHEDULED). The most recent scheduled one is the canonical one.
 */
function pickCanonicalMeeting(meetings: Meeting[], activityType: string): Meeting | null {
  const EXCLUDED_OUTCOMES = new Set(['CANCELED', 'NO_SHOW']);
  const filtered = meetings
    .filter(m => m.activityType === activityType)
    .filter(m => !m.outcome || !EXCLUDED_OUTCOMES.has(m.outcome))
    .filter(m => m.startTime)
    .sort((a, b) => new Date(a.startTime!).getTime() - new Date(b.startTime!).getTime());

  if (filtered.length === 0) return null;

  const completed = filtered.filter(m => m.outcome === 'COMPLETED');
  if (completed.length > 0) return completed[completed.length - 1];

  return filtered[filtered.length - 1];
}

export const GET = withAuth(async (_req: NextRequest, _auth: AuthenticatedRequest, context?: RouteHandlerContext) => {
  try {
    const params = await context?.params;
    const id = params?.id as string;
    if (!id) throw new ApiError(400, 'Missing client id');

    const clientRes = await pgQuery<{ hubspot_id: string }>(
      'SELECT hubspot_id FROM clients WHERE id = $1', [id]
    );
    if (clientRes.rows.length === 0) throw new ApiError(404, 'Client not found');

    const ticketsRes = await pgQuery<{ hubspot_id: string; status: string; opened_at: string | null }>(
      `SELECT hubspot_id, status, opened_at FROM tickets
       WHERE client_id = $1 AND pipeline = '0'
       ORDER BY opened_at ASC NULLS LAST`,
      [id]
    );

    if (ticketsRes.rows.length === 0) {
      return createSuccessResponse({ data: { steps: [], currentStage: null, issues: [] } });
    }

    const currentTicket = ticketsRes.rows.reduce((latest, t) => {
      if (!latest.opened_at) return t;
      if (!t.opened_at) return latest;
      return new Date(t.opened_at) > new Date(latest.opened_at) ? t : latest;
    }, ticketsRes.rows[0]);

    const hs = getHubSpotClient();
    type HsResp = {
      properties?: Record<string, string | null>;
      propertiesWithHistory?: { hs_pipeline_stage?: Array<{ value: string; timestamp: string }> };
    };
    const httpGet = (hs as unknown as { http: { get: (url: string, opts: unknown) => Promise<{ data: unknown }> } }).http.get.bind(
      (hs as unknown as { http: { get: (url: string, opts: unknown) => Promise<{ data: unknown }> } }).http
    );

    const ticketResponses = await Promise.all(
      ticketsRes.rows.map(t =>
        httpGet(
          `/crm/v3/objects/tickets/${t.hubspot_id}`,
          { params: { propertiesWithHistory: 'hs_pipeline_stage', properties: 'hs_date_entered_1,createdate' } }
        ).then(r => ({ ticket: t, data: r.data as HsResp }))
      )
    );

    // Earliest timestamp per stage across all client tickets. Ticket stage transitions act as
    // fallback when no meeting exists for a given stage (e.g. Activated, Post Onboarding).
    const earliestPerStage = new Map<string, string>();
    const setIfEarlier = (stageId: string, ts: string | null | undefined) => {
      if (!ts) return;
      const existing = earliestPerStage.get(stageId);
      if (!existing || new Date(ts) < new Date(existing)) {
        earliestPerStage.set(stageId, ts);
      }
    };

    for (const { data } of ticketResponses) {
      const history = data.propertiesWithHistory?.hs_pipeline_stage ?? [];
      for (const h of history) {
        // Tickets can be moved across pipelines (e.g. Support → Onboarding): HubSpot keeps
        // the full stage history, including stages of other pipelines. Restrict to the
        // Onboarding pipeline to avoid polluting the UI with unrelated Support stage ids.
        if (!ONBOARDING_STAGE_IDS.has(h.value)) continue;
        setIfEarlier(h.value, h.timestamp);
      }

      if (!earliestPerStage.has('1')) {
        const dealWonTs = data.properties?.hs_date_entered_1;
        if (dealWonTs) {
          const ms = Number(dealWonTs);
          const date = ms > 1e12 ? new Date(ms).toISOString() : dealWonTs;
          setIfEarlier('1', date);
        } else if (data.properties?.createdate) {
          setIfEarlier('1', data.properties.createdate);
        }
      }
    }

    // Prefer the real closed-won date from the Sales deal for Deal Won.
    const dealRes = await pgQuery<{ close_date: string | null; stage_entered_at: string | null }>(
      `SELECT close_date, stage_entered_at FROM deals
       WHERE client_id = $1 AND pipeline_id = $2 AND stage_id = $3
       ORDER BY close_date DESC NULLS LAST LIMIT 1`,
      [id, SALES_PIPELINE.id, '986053469']
    );
    const wonDeal = dealRes.rows[0];
    const dealWonDate = wonDeal?.stage_entered_at ?? wonDeal?.close_date ?? null;
    if (dealWonDate) earliestPerStage.set('1', dealWonDate);

    // Map meeting-related stages from actual HubSpot meetings via hs_activity_type.
    const engagementsRes = await pgQuery<MeetingRow>(
      `SELECT hubspot_id, occurred_at, raw_properties
       FROM engagements
       WHERE client_id = $1 AND type = 'MEETING'`,
      [id]
    );
    const meetings = engagementsRes.rows.map(toMeeting);

    for (const mapping of Object.values(ACTIVITY_TYPE_TO_STAGE)) {
      const canonical = pickCanonicalMeeting(meetings, mapping.activityType);
      if (!canonical) continue;
      const ts = mapping.date === 'created' ? canonical.createdAt : canonical.startTime;
      if (ts) earliestPerStage.set(mapping.stageId, ts);
    }

    const steps = HAPPY_PATH.map(step => ({
      id: step.id,
      label: step.label,
      completedAt: earliestPerStage.get(step.id) ?? null,
    }));

    const issues = [...earliestPerStage.entries()]
      .filter(([stageId]) => !HAPPY_PATH_IDS.has(stageId))
      .map(([stageId, timestamp]) => ({
        label: ALL_STAGES[stageId] ?? stageId,
        occurredAt: timestamp,
      }));

    return createSuccessResponse({
      data: {
        steps,
        currentStage: ALL_STAGES[currentTicket.status] ?? currentTicket.status,
        currentStageId: currentTicket.status,
        ticketHubspotId: currentTicket.hubspot_id,
        issues,
      },
    });
  } catch (error) {
    return createErrorResponse(error);
  }
});
