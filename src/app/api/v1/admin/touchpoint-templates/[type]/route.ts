import { NextRequest } from 'next/server';
import {
  authenticateRequest,
  createSuccessResponse,
  createErrorResponse,
  ApiError,
  type RouteHandlerContext,
} from '@/lib/api/middleware';
import { isAdminEmail } from '@/lib/config/owners';
import {
  getActiveTemplate,
  listTemplatesByType,
  createDraft,
} from '@/lib/services/touchpoint-questions';

function parseType(params: Record<string, string | string[] | undefined>): string {
  const t = params.type;
  const value = Array.isArray(t) ? t[0] : t;
  if (!value || typeof value !== 'string') throw new ApiError(400, 'type richiesto');
  return value;
}

export async function GET(request: NextRequest, context: RouteHandlerContext) {
  try {
    const auth = await authenticateRequest(request);
    if (!isAdminEmail(auth.email)) throw new ApiError(403, 'Accesso riservato agli admin');

    const params = await context.params;
    const type = parseType(params);

    const [active, history] = await Promise.all([getActiveTemplate(type), listTemplatesByType(type)]);
    return createSuccessResponse({ data: { active, history } });
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

    const body = (await request.json().catch(() => ({}))) as {
      systemPrompt?: string;
      label?: string;
      description?: string | null;
      notes?: string | null;
    };
    const systemPrompt = typeof body.systemPrompt === 'string' ? body.systemPrompt : '';
    if (!systemPrompt.trim()) throw new ApiError(400, 'systemPrompt non puo essere vuoto');

    let draft;
    try {
      draft = await createDraft(
        type,
        {
          systemPrompt,
          label: body.label,
          description: body.description ?? undefined,
          notes: body.notes ?? null,
        },
        auth.email ?? auth.userId,
      );
    } catch (e) {
      throw new ApiError(400, e instanceof Error ? e.message : 'Validazione fallita');
    }

    return createSuccessResponse({ data: draft }, 201);
  } catch (error) {
    return createErrorResponse(error);
  }
}
