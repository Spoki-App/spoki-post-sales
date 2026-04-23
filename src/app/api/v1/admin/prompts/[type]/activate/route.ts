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
import { activate, getTemplateById } from '@/lib/services/prompt-registry';

/**
 * Attiva una versione del template per il call_type. La attivazione bumpa la
 * promptVersion attiva: tutte le analisi gia salvate con la vecchia versione
 * verranno marcate come stale dal sistema esistente di refresh-stale e
 * ri-analizzate al prossimo passaggio.
 */
export async function POST(request: NextRequest, context: RouteHandlerContext) {
  try {
    const auth = await authenticateRequest(request);
    if (!isAdminEmail(auth.email)) throw new ApiError(403, 'Accesso riservato agli admin');

    const params = await context.params;
    const t = params.type;
    const type = Array.isArray(t) ? t[0] : t;
    if (!isCallType(type)) throw new ApiError(400, "type must be 'activation' or 'training'");

    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    const id = typeof body.id === 'string' ? body.id : '';
    if (!id) throw new ApiError(400, 'id richiesto');

    const target = await getTemplateById(id);
    if (!target) throw new ApiError(404, 'Template non trovato');
    if (target.callType !== type) {
      throw new ApiError(400, `Template ${id} appartiene a "${target.callType}", non a "${type}"`);
    }

    const updated = await activate(id);
    return createSuccessResponse({ data: updated });
  } catch (error) {
    return createErrorResponse(error);
  }
}
