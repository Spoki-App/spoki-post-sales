import { NextRequest } from 'next/server';
import { authenticateRequest, createSuccessResponse, createErrorResponse, ApiError, type AuthenticatedRequest } from '@/lib/api/middleware';
import { isAdminEmail, getOwnerName } from '@/lib/config/owners';
import { isConfigured } from '@/lib/config';
import { pgQuery } from '@/lib/db/postgres';
import { listMeetings } from '@/lib/services/fathom';
import {
  CALL_TYPE_CONFIG,
  getCallConfig,
  splitCheckpointsAndEvidences,
  type CallType,
  type CallAnalysis,
} from '@/lib/services/meeting-analysis';
import {
  archiveTranscript,
  loadArchivedTranscript,
  type TranscriptPayload,
} from '@/lib/services/transcript-archive';
import {
  matchEngagement,
  ownerEmailsFor,
  recordMatchFailure,
  clearMatchFailure,
  listMatchFailures,
  type MatchFailureReason,
} from '@/lib/services/fathom-matcher';
import { getLogger } from '@/lib/logger';

const logger = getLogger('services:call-reports');

const BATCH_MAX_CONCURRENCY = 2;
const encoder = new TextEncoder();

export interface CheckpointEvidence {
  evidence: string | null;
  confidence: 'low' | 'medium' | 'high';
}

export interface StoredAnalysis {
  checkpoints: Record<string, boolean>;
  evidences: Record<string, CheckpointEvidence> | null;
  passedCount: number;
  totalCheckpoints: number;
  promptVersion: string;
  model: string;
  analyzedAt: string;
  fathomUrl: string | null;
}

export interface CallListRow {
  hubspotId: string;
  title: string;
  date: string;
  outcome: string | null;
  owner: { id: string | null; name: string };
  client: { id: string | null; hubspotId: string | null; name: string; domain: string | null } | null;
  analysis: StoredAnalysis | null;
}

export interface CallListFilters {
  days: number;
  owner?: string;
  outcome?: string;
  from?: string; // ISO date (YYYY-MM-DD); overrides `days` lower bound
  to?: string; // ISO date (YYYY-MM-DD); upper bound, inclusive
  clientId?: string; // engagements.client_id (UUID)
}

export async function assertAdmin(auth: AuthenticatedRequest): Promise<void> {
  if (!isAdminEmail(auth.email)) {
    throw new ApiError(403, 'Accesso riservato agli admin');
  }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseListFilters(url: string): CallListFilters {
  const { searchParams } = new URL(url);
  const daysRaw = parseInt(searchParams.get('days') ?? '90', 10);
  const days = Number.isFinite(daysRaw) && daysRaw > 0 && daysRaw <= 3650 ? daysRaw : 90;
  const owner = searchParams.get('owner') || undefined;
  const outcome = searchParams.get('outcome') || undefined;
  const fromRaw = searchParams.get('from');
  const toRaw = searchParams.get('to');
  const clientId = searchParams.get('clientId') || undefined;
  return {
    days,
    owner,
    outcome: outcome === 'all' ? undefined : outcome,
    from: fromRaw && ISO_DATE.test(fromRaw) ? fromRaw : undefined,
    to: toRaw && ISO_DATE.test(toRaw) ? toRaw : undefined,
    clientId,
  };
}

export async function listCallsForType(type: CallType, filters: CallListFilters): Promise<CallListRow[]> {
  const cfg = CALL_TYPE_CONFIG[type];

  const conditions: string[] = [
    `e.type = 'MEETING'`,
    `e.raw_properties::jsonb->>'hs_meeting_title' ILIKE $1`,
  ];
  const params: unknown[] = [cfg.titlePattern];
  let idx = 2;

  if (filters.from) {
    conditions.push(`e.occurred_at >= $${idx++}::timestamptz`);
    params.push(filters.from);
  } else {
    conditions.push(`e.occurred_at >= NOW() - ($${idx++}::int || ' days')::interval`);
    params.push(filters.days);
  }

  if (filters.to) {
    // include the entire day
    conditions.push(`e.occurred_at < ($${idx++}::date + INTERVAL '1 day')`);
    params.push(filters.to);
  }

  if (filters.outcome) {
    conditions.push(`e.raw_properties::jsonb->>'hs_meeting_outcome' = $${idx++}`);
    params.push(filters.outcome.toUpperCase());
  }

  if (filters.owner) {
    conditions.push(`e.owner_id = $${idx++}`);
    params.push(filters.owner);
  }

  if (filters.clientId) {
    conditions.push(`e.client_id = $${idx++}::uuid`);
    params.push(filters.clientId);
  }

  const where = conditions.join(' AND ');

  const rows = await pgQuery<{
    hubspot_id: string;
    owner_id: string | null;
    occurred_at: string;
    client_id: string | null;
    meeting_title: string | null;
    client_name: string | null;
    client_domain: string | null;
    client_hubspot_id: string | null;
    outcome: string | null;
    a_checkpoints: Record<string, boolean> | null;
    a_evidences: Record<string, CheckpointEvidence> | null;
    a_passed_count: number | null;
    a_total_checkpoints: number | null;
    a_prompt_version: string | null;
    a_model: string | null;
    a_analyzed_at: string | null;
    a_fathom_url: string | null;
  }>(
    `SELECT e.hubspot_id, e.owner_id, e.occurred_at, e.client_id,
      e.raw_properties::jsonb->>'hs_meeting_title' AS meeting_title,
      e.raw_properties::jsonb->>'hs_meeting_outcome' AS outcome,
      c.name AS client_name, c.domain AS client_domain,
      c.hubspot_id AS client_hubspot_id,
      a.checkpoints      AS a_checkpoints,
      a.evidences        AS a_evidences,
      a.passed_count     AS a_passed_count,
      a.total_checkpoints AS a_total_checkpoints,
      a.prompt_version   AS a_prompt_version,
      a.model            AS a_model,
      a.analyzed_at      AS a_analyzed_at,
      a.fathom_share_url AS a_fathom_url
    FROM engagements e
    LEFT JOIN clients c ON c.id = e.client_id
    LEFT JOIN call_analyses a
      ON a.engagement_hubspot_id = e.hubspot_id AND a.call_type = $${idx}
    WHERE ${where}
    ORDER BY e.occurred_at DESC`,
    [...params, type],
  );

  return rows.rows.map(r => ({
    hubspotId: r.hubspot_id,
    title: r.meeting_title ?? 'Meeting',
    date: r.occurred_at,
    outcome: r.outcome ?? null,
    owner: { id: r.owner_id, name: getOwnerName(r.owner_id) },
    client: r.client_name
      ? {
          id: r.client_id,
          hubspotId: r.client_hubspot_id,
          name: r.client_name,
          domain: r.client_domain,
        }
      : null,
    analysis: r.a_checkpoints
      ? {
          checkpoints: r.a_checkpoints,
          evidences: r.a_evidences,
          passedCount: r.a_passed_count!,
          totalCheckpoints: r.a_total_checkpoints!,
          promptVersion: r.a_prompt_version!,
          model: r.a_model!,
          analyzedAt: r.a_analyzed_at!,
          fathomUrl: r.a_fathom_url,
        }
      : null,
  }));
}

interface PersistAnalysisInput {
  type: CallType;
  hubspotId: string;
  ownerId: string | null;
  clientId: string | null;
  occurredAt: string;
  fathomUrl: string | null;
  checkpoints: Record<string, boolean>;
  evidences?: Record<string, unknown> | null;
}

export async function persistAnalysis(input: PersistAnalysisInput): Promise<void> {
  const cfg = await getCallConfig(input.type);
  const passedCount = Object.values(input.checkpoints).filter(v => v === true).length;
  const totalCheckpoints = cfg.totalCheckpoints;
  const model = process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514';

  await pgQuery(
    `INSERT INTO call_analyses (
       engagement_hubspot_id, call_type, owner_id, client_id, occurred_at,
       fathom_share_url, checkpoints, evidences,
       passed_count, total_checkpoints, model, prompt_version, analyzed_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10, $11, $12, NOW())
     ON CONFLICT (engagement_hubspot_id) DO UPDATE SET
       call_type = EXCLUDED.call_type,
       owner_id = EXCLUDED.owner_id,
       client_id = EXCLUDED.client_id,
       occurred_at = EXCLUDED.occurred_at,
       fathom_share_url = EXCLUDED.fathom_share_url,
       checkpoints = EXCLUDED.checkpoints,
       evidences = EXCLUDED.evidences,
       passed_count = EXCLUDED.passed_count,
       total_checkpoints = EXCLUDED.total_checkpoints,
       model = EXCLUDED.model,
       prompt_version = EXCLUDED.prompt_version,
       analyzed_at = EXCLUDED.analyzed_at`,
    [
      input.hubspotId,
      input.type,
      input.ownerId,
      input.clientId,
      input.occurredAt,
      input.fathomUrl,
      JSON.stringify(input.checkpoints),
      input.evidences ? JSON.stringify(input.evidences) : null,
      passedCount,
      totalCheckpoints,
      model,
      cfg.promptVersion,
    ],
  );
}

export async function deleteAnalysis(type: CallType, hubspotId: string): Promise<boolean> {
  const res = await pgQuery(
    `DELETE FROM call_analyses WHERE engagement_hubspot_id = $1 AND call_type = $2`,
    [hubspotId, type],
  );
  return (res.rowCount ?? 0) > 0;
}

export interface CallSummaryFilters {
  days: number;
  owner?: string;
  from?: string;
  to?: string;
  clientId?: string;
}

export interface ClientLeaderboardEntry {
  clientId: string;
  clientName: string;
  clientHubspotId: string | null;
  totalCalls: number;
  analyzedCount: number;
  avgPassRate: number;
  avgPassedCount: number;
  totalCheckpoints: number;
  lastAnalyzedAt: string | null;
}

export interface OwnerLeaderboardEntry {
  ownerId: string | null;
  ownerName: string;
  totalCalls: number;
  analyzedCount: number;
  noFathomCount: number;
  pendingCount: number;
  avgPassRate: number; // 0..1
  avgPassedCount: number;
  totalCheckpoints: number;
  checkpointPassRates: Record<string, number>; // 0..1 per key
}

export interface CheckpointPassRate {
  key: string;
  passRate: number; // 0..1
  passed: number;
  total: number;
}

export interface WeeklyTrendPoint {
  weekStart: string; // ISO yyyy-mm-dd (Monday)
  total: number;
  analyzed: number;
  avgPassRate: number; // 0..1
}

export interface CallSummary {
  totals: {
    totalCalls: number;
    analyzedCount: number;
    noFathomCount: number;
    pendingCount: number;
    avgPassRate: number; // 0..1, only over analyzed
    avgPassedCount: number;
    totalCheckpoints: number;
  };
  checkpointPassRates: CheckpointPassRate[];
  ownerLeaderboard: OwnerLeaderboardEntry[];
  clientLeaderboard: ClientLeaderboardEntry[];
  weeklyTrend: WeeklyTrendPoint[];
}

function isoWeekStart(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay() || 7; // Sunday -> 7
  if (day !== 1) date.setUTCDate(date.getUTCDate() - (day - 1));
  return date.toISOString().slice(0, 10);
}

export async function getSummary(
  type: CallType,
  filters: CallSummaryFilters,
): Promise<CallSummary> {
  const cfg = await getCallConfig(type);
  const checkpointKeys = Object.keys(cfg.labels);
  const totalCheckpoints = checkpointKeys.length;

  // $1 = title pattern, $2 = call_type for joins.
  const params: unknown[] = [cfg.titlePattern, type];
  const conditions: string[] = [
    `e.type = 'MEETING'`,
    `e.raw_properties::jsonb->>'hs_meeting_title' ILIKE $1`,
  ];
  let idx = 3;

  if (filters.from) {
    conditions.push(`e.occurred_at >= $${idx++}::timestamptz`);
    params.push(filters.from);
  } else {
    conditions.push(`e.occurred_at >= NOW() - ($${idx++}::int || ' days')::interval`);
    params.push(filters.days);
  }
  if (filters.to) {
    conditions.push(`e.occurred_at < ($${idx++}::date + INTERVAL '1 day')`);
    params.push(filters.to);
  }
  if (filters.owner) {
    conditions.push(`e.owner_id = $${idx++}`);
    params.push(filters.owner);
  }
  if (filters.clientId) {
    conditions.push(`e.client_id = $${idx++}::uuid`);
    params.push(filters.clientId);
  }

  const rows = await pgQuery<{
    hubspot_id: string;
    owner_id: string | null;
    occurred_at: string;
    client_id: string | null;
    client_name: string | null;
    client_hubspot_id: string | null;
    a_checkpoints: Record<string, boolean> | null;
    a_passed_count: number | null;
    a_analyzed_at: string | null;
    f_reason_code: string | null;
  }>(
    `SELECT e.hubspot_id, e.owner_id, e.occurred_at,
            e.client_id,
            c.name AS client_name,
            c.hubspot_id AS client_hubspot_id,
            a.checkpoints AS a_checkpoints,
            a.passed_count AS a_passed_count,
            a.analyzed_at AS a_analyzed_at,
            f.reason_code AS f_reason_code
       FROM engagements e
       LEFT JOIN clients c ON c.id = e.client_id
       LEFT JOIN call_analyses a
         ON a.engagement_hubspot_id = e.hubspot_id AND a.call_type = $2
       LEFT JOIN call_match_failures f
         ON f.engagement_hubspot_id = e.hubspot_id AND f.call_type = $2
       WHERE ${conditions.join(' AND ')}`,
    params,
  );

  const totalCalls = rows.rows.length;
  let analyzedCount = 0;
  let noFathomCount = 0;
  let sumPassRate = 0;
  let sumPassedCount = 0;
  const checkpointPassed: Record<string, number> = Object.fromEntries(checkpointKeys.map(k => [k, 0]));

  type OwnerAgg = {
    totalCalls: number;
    analyzedCount: number;
    noFathomCount: number;
    sumPassRate: number;
    sumPassedCount: number;
    checkpointPassed: Record<string, number>;
  };
  const owners = new Map<string | null, OwnerAgg>();
  const newOwnerAgg = (): OwnerAgg => ({
    totalCalls: 0,
    analyzedCount: 0,
    noFathomCount: 0,
    sumPassRate: 0,
    sumPassedCount: 0,
    checkpointPassed: Object.fromEntries(checkpointKeys.map(k => [k, 0])),
  });

  type WeekAgg = { total: number; analyzed: number; sumRate: number };
  const weeks = new Map<string, WeekAgg>();

  type ClientAgg = {
    clientId: string;
    clientName: string;
    clientHubspotId: string | null;
    totalCalls: number;
    analyzedCount: number;
    sumPassRate: number;
    sumPassedCount: number;
    lastAnalyzedAt: string | null;
  };
  const clients = new Map<string, ClientAgg>();

  for (const r of rows.rows) {
    const ownerKey = r.owner_id;
    if (!owners.has(ownerKey)) owners.set(ownerKey, newOwnerAgg());
    const oa = owners.get(ownerKey)!;
    oa.totalCalls++;

    let ca: ClientAgg | undefined;
    if (r.client_id && r.client_name) {
      ca = clients.get(r.client_id);
      if (!ca) {
        ca = {
          clientId: r.client_id,
          clientName: r.client_name,
          clientHubspotId: r.client_hubspot_id,
          totalCalls: 0,
          analyzedCount: 0,
          sumPassRate: 0,
          sumPassedCount: 0,
          lastAnalyzedAt: null,
        };
        clients.set(r.client_id, ca);
      }
      ca.totalCalls++;
    }

    const week = isoWeekStart(new Date(r.occurred_at));
    if (!weeks.has(week)) weeks.set(week, { total: 0, analyzed: 0, sumRate: 0 });
    const wa = weeks.get(week)!;
    wa.total++;

    if (r.a_checkpoints && typeof r.a_passed_count === 'number') {
      analyzedCount++;
      oa.analyzedCount++;
      wa.analyzed++;

      const rate = totalCheckpoints > 0 ? r.a_passed_count / totalCheckpoints : 0;
      sumPassRate += rate;
      sumPassedCount += r.a_passed_count;
      oa.sumPassRate += rate;
      oa.sumPassedCount += r.a_passed_count;
      wa.sumRate += rate;

      if (ca) {
        ca.analyzedCount++;
        ca.sumPassRate += rate;
        ca.sumPassedCount += r.a_passed_count;
        if (
          r.a_analyzed_at &&
          (!ca.lastAnalyzedAt || r.a_analyzed_at > ca.lastAnalyzedAt)
        ) {
          ca.lastAnalyzedAt = r.a_analyzed_at;
        }
      }

      for (const k of checkpointKeys) {
        if (r.a_checkpoints[k] === true) {
          checkpointPassed[k]++;
          oa.checkpointPassed[k]++;
        }
      }
    } else if (r.f_reason_code) {
      noFathomCount++;
      oa.noFathomCount++;
    }
  }

  const pendingCount = totalCalls - analyzedCount - noFathomCount;
  const avgPassRate = analyzedCount > 0 ? sumPassRate / analyzedCount : 0;
  const avgPassedCount = analyzedCount > 0 ? sumPassedCount / analyzedCount : 0;

  const checkpointPassRates: CheckpointPassRate[] = checkpointKeys.map(k => ({
    key: k,
    passed: checkpointPassed[k],
    total: analyzedCount,
    passRate: analyzedCount > 0 ? checkpointPassed[k] / analyzedCount : 0,
  }));

  const ownerLeaderboard: OwnerLeaderboardEntry[] = [...owners.entries()]
    .map(([ownerId, agg]) => ({
      ownerId,
      ownerName: getOwnerName(ownerId),
      totalCalls: agg.totalCalls,
      analyzedCount: agg.analyzedCount,
      noFathomCount: agg.noFathomCount,
      pendingCount: agg.totalCalls - agg.analyzedCount - agg.noFathomCount,
      avgPassRate: agg.analyzedCount > 0 ? agg.sumPassRate / agg.analyzedCount : 0,
      avgPassedCount: agg.analyzedCount > 0 ? agg.sumPassedCount / agg.analyzedCount : 0,
      totalCheckpoints,
      checkpointPassRates: Object.fromEntries(
        checkpointKeys.map(k => [
          k,
          agg.analyzedCount > 0 ? agg.checkpointPassed[k] / agg.analyzedCount : 0,
        ]),
      ),
    }))
    .sort((a, b) => {
      if (b.analyzedCount !== a.analyzedCount) {
        // owners with at least 1 analysis on top
        if (a.analyzedCount === 0) return 1;
        if (b.analyzedCount === 0) return -1;
      }
      return b.avgPassRate - a.avgPassRate;
    });

  const weeklyTrend: WeeklyTrendPoint[] = [...weeks.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([weekStart, agg]) => ({
      weekStart,
      total: agg.total,
      analyzed: agg.analyzed,
      avgPassRate: agg.analyzed > 0 ? agg.sumRate / agg.analyzed : 0,
    }));

  const clientLeaderboard: ClientLeaderboardEntry[] = [...clients.values()]
    .map(c => ({
      clientId: c.clientId,
      clientName: c.clientName,
      clientHubspotId: c.clientHubspotId,
      totalCalls: c.totalCalls,
      analyzedCount: c.analyzedCount,
      avgPassRate: c.analyzedCount > 0 ? c.sumPassRate / c.analyzedCount : 0,
      avgPassedCount: c.analyzedCount > 0 ? c.sumPassedCount / c.analyzedCount : 0,
      totalCheckpoints,
      lastAnalyzedAt: c.lastAnalyzedAt,
    }))
    .filter(c => c.analyzedCount > 0)
    .sort((a, b) => b.avgPassRate - a.avgPassRate);

  return {
    totals: {
      totalCalls,
      analyzedCount,
      noFathomCount,
      pendingCount,
      avgPassRate,
      avgPassedCount,
      totalCheckpoints,
    },
    checkpointPassRates,
    ownerLeaderboard,
    clientLeaderboard,
    weeklyTrend,
  };
}

export async function handleSummaryRequest(type: CallType, request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    await assertAdmin(auth);
    const filters = parseListFilters(request.url);
    const summary = await getSummary(type, filters);
    return createSuccessResponse({ data: summary });
  } catch (error) {
    return createErrorResponse(error);
  }
}


export async function analyzeSingleCall(type: CallType, hubspotId: string) {
  const cfg = await getCallConfig(type);

  const engRow = await pgQuery<{
    meeting_title: string | null;
    occurred_at: string;
    owner_id: string | null;
    client_id: string | null;
    fathom_share_url: string | null;
    meeting_notes: string | null;
  }>(
    `SELECT
      raw_properties::jsonb->>'hs_meeting_title' AS meeting_title,
      occurred_at,
      owner_id,
      client_id,
      raw_properties::jsonb->>'fathom_share_url' AS fathom_share_url,
      raw_properties::jsonb->>'hs_internal_meeting_notes' AS meeting_notes
    FROM engagements
    WHERE hubspot_id = $1`,
    [hubspotId],
  );

  if (engRow.rows.length === 0) {
    throw new ApiError(404, 'Engagement non trovato nel DB');
  }

  const { meeting_title, occurred_at, owner_id, client_id, fathom_share_url, meeting_notes } = engRow.rows[0];
  if (!meeting_title) {
    await recordMatchFailure(hubspotId, type, 'NO_TITLE');
    throw new ApiError(400, 'Meeting senza titolo');
  }

  // Fathom URL is rarely populated on engagements.raw_properties, so we also probe meeting notes.
  let actualFathomUrl = fathom_share_url;
  if (!actualFathomUrl && meeting_notes) {
    const fathomUrlMatch = meeting_notes.match(/https:\/\/fathom\.video\/share\/[a-zA-Z0-9_-]+/);
    actualFathomUrl = fathomUrlMatch ? fathomUrlMatch[0] : null;
  }

  let transcript: TranscriptPayload | null = null;
  let matchedRecordingId: number | null = null;

  // Try cached archive first to skip the slow Fathom pagination.
  const cached = await loadArchivedTranscript(hubspotId);
  if (cached && cached.length > 0) {
    transcript = cached;
    logger.debug('Using archived transcript', { hubspotId });
  }

  if (!transcript) {
    const ownerEmails = ownerEmailsFor(owner_id);
    const meetingDate = new Date(occurred_at);
    const searchAfter = new Date(meetingDate.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();

    let meetings: Awaited<ReturnType<typeof listMeetings>>;
    try {
      meetings = await listMeetings({
        createdAfter: searchAfter,
        includeTranscript: true,
        maxPages: 30,
        ...(ownerEmails.length > 0 ? { recordedBy: ownerEmails } : {}),
      });
    } catch (e) {
      logger.error('Fathom fetch failed (single)', { hubspotId, error: String(e) });
      await recordMatchFailure(hubspotId, type, 'FATHOM_FETCH_FAILED');
      throw new ApiError(502, 'Errore nel recupero dei meeting da Fathom. Riprova tra poco.');
    }

    let { meeting: match, strategy, reasonCode } = matchEngagement(
      { hubspot_id: hubspotId, meeting_title, occurred_at, owner_id, fathom_share_url: actualFathomUrl },
      meetings,
      new Set<number>(),
    );

    if (!match) {
      // Fallback: refetch without owner constraint.
      try {
        const fallback = await listMeetings({
          createdAfter: searchAfter,
          includeTranscript: true,
          maxPages: 40,
        });
        const r = matchEngagement(
          { hubspot_id: hubspotId, meeting_title, occurred_at, owner_id, fathom_share_url: actualFathomUrl },
          fallback,
          new Set<number>(),
        );
        match = r.meeting;
        strategy = r.strategy;
        reasonCode = r.reasonCode;
      } catch (e) {
        logger.warn('Fathom fallback fetch failed (single)', { hubspotId, error: String(e) });
      }
    }

    if (!match) {
      await recordMatchFailure(hubspotId, type, reasonCode ?? 'NO_MATCH');
      throw new ApiError(
        404,
        "Trascrizione non trovata su Fathom. Il meeting potrebbe essere troppo vecchio, la registrazione non e' piu' disponibile, oppure non e' associabile via titolo/owner.",
      );
    }

    if (!match.transcript || match.transcript.length === 0) {
      await recordMatchFailure(hubspotId, type, 'NO_TRANSCRIPT');
      throw new ApiError(400, 'Trascrizione non disponibile su Fathom per questo meeting');
    }

    logger.info('Single match', { hubspotId, strategy, recordingId: match.recording_id });

    transcript = match.transcript;
    matchedRecordingId = match.recording_id;
    if (!actualFathomUrl) actualFathomUrl = match.share_url || match.url || null;

    // Archive in background so subsequent re-analyses skip Fathom paging entirely.
    void archiveTranscript({
      hubspotId,
      type,
      recordingId: match.recording_id,
      title: meeting_title,
      shareUrl: actualFathomUrl,
      occurredAt: occurred_at,
      transcript: match.transcript,
    }).catch(e => logger.warn('Archive transcript failed (single)', { hubspotId, error: e }));
  }

  // Match succeeded (or transcript came from archive): clear any previous failure record.
  await clearMatchFailure(hubspotId).catch(() => undefined);
  void matchedRecordingId;

  const analysis = await cfg.analyze(transcript);
  const { checkpoints, evidences } = splitCheckpointsAndEvidences(analysis);

  try {
    await persistAnalysis({
      type,
      hubspotId,
      ownerId: owner_id,
      clientId: client_id,
      occurredAt: occurred_at,
      fathomUrl: actualFathomUrl,
      checkpoints,
      evidences,
    });
  } catch (e) {
    logger.error('Persist analysis failed (single)', { hubspotId, error: e });
  }

  return {
    hubspotId,
    title: meeting_title,
    fathomUrl: actualFathomUrl,
    analysis: analysis as CallAnalysis,
  };
}

function sse(event: string, data: unknown): Uint8Array {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export function buildBatchStream(type: CallType, hubspotIds: string[]): ReadableStream<Uint8Array> {
  const total = hubspotIds.length;

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const cfg = await getCallConfig(type);
      const counters = { analyzed: 0, failed: 0, skipped: 0, done: 0 };

      function emitProgress(hubspotId: string | null, status: string, error?: string) {
        counters.done++;
        controller.enqueue(
          sse('progress', {
            hubspotId,
            status,
            current: counters.done,
            total,
            ...(error ? { error } : {}),
          }),
        );
      }

      try {
        const placeholders = hubspotIds.map((_, i) => `$${i + 1}`).join(', ');
        const engRows = await pgQuery<{
          hubspot_id: string;
          meeting_title: string | null;
          occurred_at: string;
          owner_id: string | null;
          client_id: string | null;
          fathom_share_url: string | null;
        }>(
          `SELECT hubspot_id,
                  raw_properties::jsonb->>'hs_meeting_title' AS meeting_title,
                  occurred_at,
                  owner_id,
                  client_id,
                  raw_properties::jsonb->>'fathom_share_url' AS fathom_share_url
           FROM engagements
           WHERE hubspot_id IN (${placeholders})`,
          hubspotIds,
        );

        // Skip engagements already analyzed for this call_type so we don't reprocess them.
        const alreadyAnalyzed = await pgQuery<{ engagement_hubspot_id: string }>(
          `SELECT engagement_hubspot_id FROM call_analyses
           WHERE call_type = $1 AND engagement_hubspot_id IN (${placeholders.replace(/\$(\d+)/g, (_, n) => `$${parseInt(n, 10) + 1}`)})`,
          [type, ...hubspotIds],
        );
        const alreadyAnalyzedSet = new Set(alreadyAnalyzed.rows.map(r => r.engagement_hubspot_id));

        const engagements = engRows.rows.filter(
          r => r.meeting_title && !alreadyAnalyzedSet.has(r.hubspot_id),
        );
        const engagementMap = new Map(engagements.map(e => [e.hubspot_id, e]));

        const missingIds = hubspotIds.filter(
          id => !engRows.rows.some(r => r.hubspot_id === id && r.meeting_title),
        );
        counters.skipped += missingIds.length;
        for (const id of missingIds) {
          emitProgress(id, 'error', 'Engagement non trovato o senza titolo');
        }

        for (const id of alreadyAnalyzedSet) {
          counters.skipped++;
          emitProgress(id, 'skipped', 'Gia analizzata in precedenza');
        }

        if (engagements.length === 0) {
          controller.enqueue(
            sse('complete', { analyzed: counters.analyzed, failed: counters.failed, skipped: counters.skipped }),
          );
          controller.close();
          return;
        }

        type AnalysisJob = {
          hubspotId: string;
          meetingTitle: string;
          transcript: TranscriptPayload;
          fathomUrl: string | undefined;
          ownerId: string | null;
          clientId: string | null;
          occurredAt: string;
          fromArchive: boolean;
          recordingId: number | null;
        };

        const jobs: AnalysisJob[] = [];

        // Pre-load archived transcripts to skip Fathom for cached engagements.
        const engagementsNeedingFathom: typeof engagements = [];
        for (const eng of engagements) {
          const archived = await loadArchivedTranscript(eng.hubspot_id);
          if (archived && archived.length > 0) {
            jobs.push({
              hubspotId: eng.hubspot_id,
              meetingTitle: eng.meeting_title!,
              transcript: archived,
              fathomUrl: eng.fathom_share_url ?? undefined,
              ownerId: eng.owner_id,
              clientId: eng.client_id,
              occurredAt: eng.occurred_at,
              fromArchive: true,
              recordingId: null,
            });
          } else {
            engagementsNeedingFathom.push(eng);
          }
        }

        logger.info(
          `Batch: ${jobs.length} loaded from archive, ${engagementsNeedingFathom.length} need Fathom fetch`,
        );

        if (engagementsNeedingFathom.length > 0) {
          const earliestDate = engagementsNeedingFathom.reduce((min, e) => {
            const d = new Date(e.occurred_at).getTime();
            return d < min ? d : min;
          }, Infinity);
          const searchDate = new Date(earliestDate - 2 * 24 * 60 * 60 * 1000).toISOString();

          const ownerIds = [
            ...new Set(engagementsNeedingFathom.map(e => e.owner_id).filter(Boolean)),
          ] as string[];
          const allOwnerEmails = new Set<string>();
          for (const oid of ownerIds) {
            for (const email of ownerEmailsFor(oid)) allOwnerEmails.add(email);
          }
          const recordedBy = allOwnerEmails.size > 0 ? [...allOwnerEmails] : undefined;

          logger.info('Batch: fetching Fathom meetings', {
            type,
            count: engagementsNeedingFathom.length,
            searchDate,
            recordedBy,
          });
          controller.enqueue(sse('fetching', { status: 'fetching_transcripts' }));

          let fathomMeetings: Awaited<ReturnType<typeof listMeetings>> = [];
          try {
            fathomMeetings = await listMeetings({
              createdAfter: searchDate,
              includeTranscript: true,
              maxPages: 40,
              ...(recordedBy ? { recordedBy } : {}),
            });
          } catch (e) {
            logger.error('Batch: Fathom fetch failed', e);
            for (const eng of engagementsNeedingFathom) {
              counters.failed++;
              emitProgress(eng.hubspot_id, 'error', 'Errore nel recupero dei meeting da Fathom');
            }
            fathomMeetings = [];
          }

          logger.info(
            `Batch: fetched ${fathomMeetings.length} Fathom meetings for ${allOwnerEmails.size} owners`,
          );

          const usedFathomIds = new Set<number>();

          for (const eng of engagementsNeedingFathom) {
            let { meeting: match, strategy, reasonCode } = matchEngagement(
              {
                hubspot_id: eng.hubspot_id,
                meeting_title: eng.meeting_title,
                occurred_at: eng.occurred_at,
                owner_id: eng.owner_id,
                fathom_share_url: eng.fathom_share_url,
              },
              fathomMeetings,
              usedFathomIds,
            );

            if (!match && eng.fathom_share_url) {
              logger.info('Batch: trying fallback without recorded_by filter', { hubspotId: eng.hubspot_id });
              try {
                const fallbackDate = new Date(
                  new Date(eng.occurred_at).getTime() - 2 * 24 * 60 * 60 * 1000,
                ).toISOString();
                const fallbackMeetings = await listMeetings({
                  createdAfter: fallbackDate,
                  includeTranscript: true,
                  maxPages: 40,
                });
                const r = matchEngagement(
                  {
                    hubspot_id: eng.hubspot_id,
                    meeting_title: eng.meeting_title,
                    occurred_at: eng.occurred_at,
                    owner_id: eng.owner_id,
                    fathom_share_url: eng.fathom_share_url,
                  },
                  fallbackMeetings,
                  new Set<number>(),
                );
                match = r.meeting;
                strategy = r.strategy;
                reasonCode = r.reasonCode;
              } catch (e) {
                logger.warn('Batch: fallback Fathom fetch failed', {
                  hubspotId: eng.hubspot_id,
                  error: String(e),
                });
              }
            }

            if (!match) {
              const code: MatchFailureReason = reasonCode ?? 'NO_MATCH';
              logger.info('Batch: no match for engagement', {
                hubspotId: eng.hubspot_id,
                title: eng.meeting_title,
                date: new Date(eng.occurred_at).toDateString(),
                reasonCode: code,
              });
              counters.skipped++;
              await recordMatchFailure(eng.hubspot_id, type, code).catch(() => undefined);
              emitProgress(eng.hubspot_id, 'error', 'Nessun meeting Fathom corrispondente');
              continue;
            }

            if (!match.transcript || match.transcript.length === 0) {
              counters.skipped++;
              await recordMatchFailure(eng.hubspot_id, type, 'NO_TRANSCRIPT').catch(() => undefined);
              emitProgress(eng.hubspot_id, 'error', 'Trascrizione non disponibile su Fathom');
              continue;
            }

            logger.info('Batch match', { hubspotId: eng.hubspot_id, strategy, recordingId: match.recording_id });

            usedFathomIds.add(match.recording_id);
            await clearMatchFailure(eng.hubspot_id).catch(() => undefined);

            jobs.push({
              hubspotId: eng.hubspot_id,
              meetingTitle: eng.meeting_title!,
              transcript: match.transcript,
              fathomUrl: match.share_url || match.url,
              ownerId: eng.owner_id,
              clientId: eng.client_id,
              occurredAt: eng.occurred_at,
              fromArchive: false,
              recordingId: match.recording_id,
            });

            // Archive freshly-fetched transcripts so the next analysis skips Fathom paging.
            void archiveTranscript({
              hubspotId: eng.hubspot_id,
              type,
              recordingId: match.recording_id,
              title: eng.meeting_title,
              shareUrl: match.share_url || match.url || null,
              occurredAt: eng.occurred_at,
              transcript: match.transcript,
            }).catch(err =>
              logger.warn('Archive transcript failed (batch)', {
                hubspotId: eng.hubspot_id,
                error: String(err),
              }),
            );
          }
        }

        logger.info(`Batch: ${jobs.length} jobs to analyze, ${counters.skipped} skipped`);

        // Shared job index: JS is single-threaded for synchronous code, so post-increment is atomic.
        let jobIdx = 0;

        async function runWorker(): Promise<void> {
          while (jobIdx < jobs.length) {
            const job = jobs[jobIdx++];

            controller.enqueue(
              sse('progress', {
                hubspotId: job.hubspotId,
                status: 'analyzing',
                current: counters.done,
                total,
              }),
            );

            try {
              const analysis = await cfg.analyze(job.transcript);
              counters.analyzed++;

              const { checkpoints, evidences } = splitCheckpointsAndEvidences(analysis);

              try {
                await persistAnalysis({
                  type,
                  hubspotId: job.hubspotId,
                  ownerId: job.ownerId,
                  clientId: job.clientId,
                  occurredAt: job.occurredAt,
                  fathomUrl: job.fathomUrl ?? null,
                  checkpoints,
                  evidences,
                });
              } catch (persistErr) {
                logger.error('Persist analysis failed (batch)', {
                  hubspotId: job.hubspotId,
                  error: persistErr,
                });
              }

              controller.enqueue(
                sse('result', {
                  hubspotId: job.hubspotId,
                  title: job.meetingTitle,
                  fathomUrl: job.fathomUrl,
                  analysis,
                }),
              );
              emitProgress(job.hubspotId, 'done');
            } catch (e) {
              counters.failed++;
              logger.error(`Batch: analysis failed for ${job.hubspotId}`, e);
              emitProgress(
                job.hubspotId,
                'error',
                e instanceof Error ? e.message : "Errore nell'analisi",
              );
            }
          }
        }

        const workers = Array.from(
          { length: Math.min(BATCH_MAX_CONCURRENCY, jobs.length) },
          () => runWorker(),
        );
        await Promise.all(workers);

        controller.enqueue(
          sse('complete', {
            analyzed: counters.analyzed,
            failed: counters.failed,
            skipped: counters.skipped,
          }),
        );
      } catch (e) {
        logger.error('Batch: unexpected error', e);
        controller.enqueue(
          sse('progress', {
            hubspotId: null,
            status: 'error',
            current: counters.done,
            total,
            error: 'Errore imprevisto nel batch',
          }),
        );
      } finally {
        controller.close();
      }
    },
  });
}

export async function handleBatchRequest(type: CallType, request: NextRequest): Promise<Response> {
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
    return new Response(
      JSON.stringify({ success: false, error: 'Accesso riservato agli admin' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } },
    );
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
    return new Response(
      JSON.stringify({ success: false, error: e instanceof Error ? e.message : 'Invalid body' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const stream = buildBatchStream(type, hubspotIds);
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

export async function handleListRequest(type: CallType, request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    await assertAdmin(auth);
    const filters = parseListFilters(request.url);
    const data = await listCallsForType(type, filters);
    const cfg = await getCallConfig(type);

    const matchFailures = await listMatchFailures(
      type,
      data.map(d => d.hubspotId),
    ).catch(err => {
      logger.warn('listMatchFailures failed', { error: String(err) });
      return [];
    });
    const failureMap = new Map(matchFailures.map(f => [f.hubspotId, f]));
    const dataWithDiagnostics = data.map(row => ({
      ...row,
      matchFailure: failureMap.get(row.hubspotId) ?? null,
    }));

    return createSuccessResponse({
      data: dataWithDiagnostics,
      total: dataWithDiagnostics.length,
      currentPromptVersion: cfg.promptVersion,
      currentLabels: cfg.labels,
    });
  } catch (error) {
    return createErrorResponse(error);
  }
}

export async function handleSingleAnalyzeRequest(type: CallType, request: NextRequest, hubspotId: string) {
  try {
    const auth = await authenticateRequest(request);
    await assertAdmin(auth);
    if (!isConfigured('fathom')) throw new ApiError(400, 'Fathom non configurato');
    if (!hubspotId) throw new ApiError(400, 'hubspotId is required');

    const data = await analyzeSingleCall(type, hubspotId);
    return createSuccessResponse({ data });
  } catch (error) {
    return createErrorResponse(error);
  }
}
