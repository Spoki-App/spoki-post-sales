import { NextRequest } from 'next/server';
import {
  authenticateRequest,
  createSuccessResponse,
  createErrorResponse,
  ApiError,
  type RouteHandlerContext,
} from '@/lib/api/middleware';
import { isAdminEmail } from '@/lib/config/owners';
import { isCallType } from '@/lib/services/meeting-analysis';
import {
  getActiveTemplate,
  listTemplates,
  createDraft,
} from '@/lib/services/prompt-registry';

function parseType(params: Record<string, string | string[] | undefined>) {
  const t = params.type;
  const value = Array.isArray(t) ? t[0] : t;
  if (!isCallType(value)) {
    throw new ApiError(400, "type must be 'activation' or 'training'");
  }
  return value;
}

export async function GET(request: NextRequest, context: RouteHandlerContext) {
  try {
    const auth = await authenticateRequest(request);
    if (!isAdminEmail(auth.email)) throw new ApiError(403, 'Accesso riservato agli admin');

    const params = await context.params;
    const type = parseType(params);

    const [active, all] = await Promise.all([getActiveTemplate(type), listTemplates(type)]);
    return createSuccessResponse({ data: { active, history: all } });
  } catch (error) {
    return createErrorResponse(error);
  }
}

export async function POST(request: NextRequest, context: RouteHandlerContext) {
  try {
    const auth = await authenticateRequest(request);
    if (!isAdminEmail(auth.email)) throw new ApiError(403, 'Accesso riservato agli admin');

    const params = await context.params;
    const type = parseType(params);

    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    const systemPrompt = typeof body.systemPrompt === 'string' ? body.systemPrompt : '';
    const checkpoints = Array.isArray(body.checkpoints) ? body.checkpoints : [];
    const notes = typeof body.notes === 'string' ? body.notes : null;

    if (!systemPrompt.trim()) throw new ApiError(400, 'systemPrompt non puo essere vuoto');

    let draft;
    try {
      draft = await createDraft(type, { systemPrompt, checkpoints, notes }, auth.email ?? auth.userId);
    } catch (e) {
      throw new ApiError(400, e instanceof Error ? e.message : 'Validazione fallita');
    }

    return createSuccessResponse({ data: draft }, 201);
  } catch (error) {
    return createErrorResponse(error);
  }
}
