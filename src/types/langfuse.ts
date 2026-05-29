export type LangfuseIdType = 'session' | 'user' | 'trace';

export type LangfuseObservationType = 'GENERATION' | 'SPAN' | 'EVENT';

export type LangfuseLevel = 'DEFAULT' | 'DEBUG' | 'WARNING' | 'ERROR';

export interface LangfuseUsage {
  input: number | null;
  output: number | null;
  total: number | null;
  unit: string | null;
}

export interface LangfuseObservation {
  id: string;
  traceId: string;
  parentObservationId: string | null;
  type: LangfuseObservationType;
  name: string | null;
  startTime: string;
  endTime: string | null;
  latencyMs: number | null;
  model: string | null;
  modelParameters: Record<string, unknown> | null;
  input: unknown;
  output: unknown;
  usage: LangfuseUsage | null;
  level: LangfuseLevel;
  statusMessage: string | null;
  metadata: Record<string, unknown> | null;
  cost: number | null;
}

export interface LangfuseTrace {
  id: string;
  timestamp: string;
  name: string | null;
  userId: string | null;
  sessionId: string | null;
  release: string | null;
  version: string | null;
  input: unknown;
  output: unknown;
  metadata: Record<string, unknown> | null;
  tags: string[];
  latencyMs: number | null;
  totalCost: number | null;
  observationCount: number | null;
  level: LangfuseLevel | null;
  hasError: boolean;
}

export interface LangfuseTraceDetail extends LangfuseTrace {
  observations: LangfuseObservation[];
}

export interface LangfuseLookupListResponse {
  kind: 'list';
  items: LangfuseTrace[];
  total: number;
  page: number;
  limit: number;
}

export interface LangfuseLookupTraceResponse {
  kind: 'trace';
  item: LangfuseTraceDetail;
}

export type LangfuseLookupResponse = LangfuseLookupListResponse | LangfuseLookupTraceResponse;
