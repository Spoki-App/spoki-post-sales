import { config, isConfigured } from '@/lib/config';
import { getLogger } from '@/lib/logger';
import { ApiError } from '@/lib/api/middleware';
import type {
  LangfuseLevel,
  LangfuseObservation,
  LangfuseObservationType,
  LangfuseTrace,
  LangfuseTraceDetail,
  LangfuseUsage,
} from '@/types/langfuse';

const logger = getLogger('services:langfuse-api');

const TRACES_PATH = '/api/public/traces';
const OBSERVATIONS_PATH = '/api/public/observations';

function authHeader(): string {
  const token = Buffer.from(`${config.langfuse.publicKey}:${config.langfuse.secretKey}`).toString('base64');
  return `Basic ${token}`;
}

function ensureConfigured(): void {
  if (!isConfigured('langfuse')) {
    throw new ApiError(503, 'Langfuse non configurato: impostare LANGFUSE_PUBLIC_KEY e LANGFUSE_SECRET_KEY');
  }
}

async function lfFetch<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
  ensureConfigured();
  const url = new URL(config.langfuse.baseUrl + path);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null || v === '') continue;
      url.searchParams.set(k, String(v));
    }
  }

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      Authorization: authHeader(),
      Accept: 'application/json',
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    logger.warn(`Langfuse ${res.status}`, { path, body: text.slice(0, 500) });
    if (res.status === 404) {
      throw new ApiError(404, 'Risorsa non trovata su Langfuse');
    }
    if (res.status === 401 || res.status === 403) {
      throw new ApiError(502, 'Credenziali Langfuse non valide');
    }
    throw new ApiError(502, `Errore Langfuse (${res.status})`);
  }

  return (await res.json()) as T;
}

// Langfuse REST shape (subset, only the fields we use; the API returns more)
interface LfApiObservation {
  id: string;
  traceId: string;
  parentObservationId?: string | null;
  type: string;
  name?: string | null;
  startTime: string;
  endTime?: string | null;
  // Computed by Langfuse on the response (ms). Optional because some endpoints
  // return latencies in seconds via a separate field.
  latency?: number | null;
  latencyMs?: number | null;
  model?: string | null;
  modelParameters?: Record<string, unknown> | null;
  input?: unknown;
  output?: unknown;
  usage?: { input?: number | null; output?: number | null; total?: number | null; unit?: string | null } | null;
  level?: string | null;
  statusMessage?: string | null;
  metadata?: Record<string, unknown> | null;
  calculatedTotalCost?: number | null;
  totalCost?: number | null;
}

interface LfApiTrace {
  id: string;
  timestamp: string;
  name?: string | null;
  userId?: string | null;
  sessionId?: string | null;
  release?: string | null;
  version?: string | null;
  input?: unknown;
  output?: unknown;
  metadata?: Record<string, unknown> | null;
  tags?: string[] | null;
  latency?: number | null; // seconds
  latencyMs?: number | null;
  totalCost?: number | null;
  calculatedTotalCost?: number | null;
  observations?: LfApiObservation[] | null;
  scores?: unknown;
  level?: string | null;
}

interface LfApiTracesList {
  data: LfApiTrace[];
  meta: { totalItems: number; totalPages: number; page: number; limit: number };
}

function normalizeLevel(value: unknown): LangfuseLevel {
  const v = String(value ?? '').toUpperCase();
  if (v === 'DEBUG' || v === 'WARNING' || v === 'ERROR') return v;
  return 'DEFAULT';
}

function normalizeObservationType(value: unknown): LangfuseObservationType {
  const v = String(value ?? '').toUpperCase();
  if (v === 'GENERATION' || v === 'EVENT') return v;
  return 'SPAN';
}

function normalizeUsage(u: LfApiObservation['usage']): LangfuseUsage | null {
  if (!u) return null;
  if (u.input == null && u.output == null && u.total == null) return null;
  return {
    input: typeof u.input === 'number' ? u.input : null,
    output: typeof u.output === 'number' ? u.output : null,
    total: typeof u.total === 'number' ? u.total : null,
    unit: typeof u.unit === 'string' ? u.unit : null,
  };
}

function latencyMsFromLfObservation(o: LfApiObservation): number | null {
  if (typeof o.latencyMs === 'number') return o.latencyMs;
  if (typeof o.latency === 'number') return Math.round(o.latency);
  if (o.endTime) {
    const start = Date.parse(o.startTime);
    const end = Date.parse(o.endTime);
    if (Number.isFinite(start) && Number.isFinite(end)) return end - start;
  }
  return null;
}

function latencyMsFromLfTrace(t: LfApiTrace): number | null {
  if (typeof t.latencyMs === 'number') return t.latencyMs;
  if (typeof t.latency === 'number') return Math.round(t.latency * 1000);
  return null;
}

function normalizeObservation(o: LfApiObservation): LangfuseObservation {
  const cost = typeof o.calculatedTotalCost === 'number'
    ? o.calculatedTotalCost
    : typeof o.totalCost === 'number'
      ? o.totalCost
      : null;

  return {
    id: o.id,
    traceId: o.traceId,
    parentObservationId: o.parentObservationId ?? null,
    type: normalizeObservationType(o.type),
    name: o.name ?? null,
    startTime: o.startTime,
    endTime: o.endTime ?? null,
    latencyMs: latencyMsFromLfObservation(o),
    model: o.model ?? null,
    modelParameters: o.modelParameters ?? null,
    input: o.input ?? null,
    output: o.output ?? null,
    usage: normalizeUsage(o.usage),
    level: normalizeLevel(o.level),
    statusMessage: o.statusMessage ?? null,
    metadata: o.metadata ?? null,
    cost,
  };
}

function normalizeTrace(t: LfApiTrace, observations?: LangfuseObservation[]): LangfuseTrace {
  const cost = typeof t.calculatedTotalCost === 'number'
    ? t.calculatedTotalCost
    : typeof t.totalCost === 'number'
      ? t.totalCost
      : null;

  const obs = observations ?? (t.observations ?? []).map(normalizeObservation);
  const hasError = obs.some(o => o.level === 'ERROR');

  return {
    id: t.id,
    timestamp: t.timestamp,
    name: t.name ?? null,
    userId: t.userId ?? null,
    sessionId: t.sessionId ?? null,
    release: t.release ?? null,
    version: t.version ?? null,
    input: t.input ?? null,
    output: t.output ?? null,
    metadata: t.metadata ?? null,
    tags: Array.isArray(t.tags) ? t.tags : [],
    latencyMs: latencyMsFromLfTrace(t),
    totalCost: cost,
    observationCount: obs.length > 0 ? obs.length : null,
    level: t.level ? normalizeLevel(t.level) : null,
    hasError,
  };
}

export interface ListTracesParams {
  sessionId?: string;
  userId?: string;
  fromTimestamp: string;
  toTimestamp: string;
  page?: number;
  limit?: number;
}

export interface ListTracesResult {
  items: LangfuseTrace[];
  total: number;
  page: number;
  limit: number;
}

export async function listTraces(params: ListTracesParams): Promise<ListTracesResult> {
  const limit = Math.min(Math.max(params.limit ?? 50, 1), 100);
  const page = Math.max(params.page ?? 1, 1);

  const data = await lfFetch<LfApiTracesList>(TRACES_PATH, {
    sessionId: params.sessionId,
    userId: params.userId,
    fromTimestamp: params.fromTimestamp,
    toTimestamp: params.toTimestamp,
    page,
    limit,
  });

  const items = (data.data ?? []).map(t => normalizeTrace(t));
  return {
    items,
    total: data.meta?.totalItems ?? items.length,
    page: data.meta?.page ?? page,
    limit: data.meta?.limit ?? limit,
  };
}

export async function getTrace(traceId: string): Promise<LangfuseTraceDetail> {
  const trace = await lfFetch<LfApiTrace>(`${TRACES_PATH}/${encodeURIComponent(traceId)}`);

  let observations = (trace.observations ?? []).map(normalizeObservation);

  // Some Langfuse instances do not embed observations in the trace endpoint; fall
  // back to the dedicated list endpoint so the UI always has a populated tree.
  if (observations.length === 0) {
    try {
      const list = await lfFetch<{ data: LfApiObservation[] }>(OBSERVATIONS_PATH, {
        traceId,
        limit: 100,
      });
      observations = (list.data ?? []).map(normalizeObservation);
    } catch (e) {
      logger.warn('Fallback observations fetch failed', { traceId, error: String(e) });
    }
  }

  observations.sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime));

  const base = normalizeTrace(trace, observations);
  return { ...base, observations };
}
