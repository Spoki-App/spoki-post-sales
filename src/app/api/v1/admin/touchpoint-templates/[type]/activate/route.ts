import { NextRequest } from 'next/server';
import {
  authenticateRequest,
  createSuccessResponse,
  createErrorResponse,
  ApiError,
  type RouteHandlerContext,
} from '@/lib/api/middleware';
import { isAdminEmail } from '@/lib/config/owners';
import { activate, getTemplateById } from '@/lib/services/touchpoint-questions';

export async function POST(request: NextRequest, context: RouteHandlerContext) {
  try {
    const auth = await authenticateRequest(request);
    if (!isAdminEmail(auth.email)) throw new ApiError(403, 'Accesso riservato agli admin');

    const params = await context.params;
    const t = params.type;
    const type = Array.isArray(t) ? t[0] : t;
    if (!type) throw new ApiError(400, 'type richiesto');

    const body = (await request.json().catch(() => ({}))) as { id?: string };
    const id = typeof body.id === 'string' ? body.id : '';
    if (!id) throw new ApiError(400, 'id richiesto');

    const target = await getTemplateById(id);
    if (!target) throw new ApiError(404, 'Template non trovato');
    if (target.touchpointType !== type) {
      throw new ApiError(400, `Template ${id} appartiene a "${target.touchpointType}", non a "${type}"`);
    }

    const updated = await activate(id);
    return createSuccessResponse({ data: updated });
  } catch (error) {
    return createErrorResponse(error);
  }
}
