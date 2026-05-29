import { NextRequest } from 'next/server';
import {
  withAuth,
  createSuccessResponse,
  createErrorResponse,
  ApiError,
  type AuthenticatedRequest,
} from '@/lib/api/middleware';
import { isAdminEmail } from '@/lib/config/owners';
import { getTrace, listTraces } from '@/lib/services/langfuse-api';
import type { LangfuseIdType, LangfuseLookupResponse } from '@/types/langfuse';

function parseIdType(value: string | null): LangfuseIdType {
  if (value === 'session' || value === 'user' || value === 'trace') return value;
  throw new ApiError(400, "idType deve essere 'session', 'user' o 'trace'");
}

function parseIso(value: string | null, label: string): string {
  if (!value) throw new ApiError(400, `Parametro ${label} mancante`);
  const ts = Date.parse(value);
  if (!Number.isFinite(ts)) throw new ApiError(400, `Parametro ${label} non e' una data valida`);
  return new Date(ts).toISOString();
}

export const GET = withAuth(async (request: NextRequest, auth: AuthenticatedRequest) => {
  try {
    if (!isAdminEmail(auth.email)) throw new ApiError(403, 'Accesso riservato agli admin');

    const url = new URL(request.url);
    const idType = parseIdType(url.searchParams.get('idType'));
    const id = (url.searchParams.get('id') ?? '').trim();
    if (!id) throw new ApiError(400, 'Parametro id mancante');

    if (idType === 'trace') {
      const item = await getTrace(id);
      const payload: LangfuseLookupResponse = { kind: 'trace', item };
      return createSuccessResponse({ data: payload });
    }

    const fromTimestamp = parseIso(url.searchParams.get('from'), 'from');
    const toTimestamp = parseIso(url.searchParams.get('to'), 'to');
    if (Date.parse(fromTimestamp) > Date.parse(toTimestamp)) {
      throw new ApiError(400, "L'orario 'da' deve essere precedente a 'a'");
    }

    const pageRaw = parseInt(url.searchParams.get('page') ?? '1', 10);
    const limitRaw = parseInt(url.searchParams.get('limit') ?? '50', 10);

    const result = await listTraces({
      sessionId: idType === 'session' ? id : undefined,
      userId: idType === 'user' ? id : undefined,
      fromTimestamp,
      toTimestamp,
      page: Number.isFinite(pageRaw) ? pageRaw : 1,
      limit: Number.isFinite(limitRaw) ? limitRaw : 50,
    });

    const payload: LangfuseLookupResponse = {
      kind: 'list',
      items: result.items,
      total: result.total,
      page: result.page,
      limit: result.limit,
    };
    return createSuccessResponse({ data: payload });
  } catch (error) {
    return createErrorResponse(error);
  }
});
