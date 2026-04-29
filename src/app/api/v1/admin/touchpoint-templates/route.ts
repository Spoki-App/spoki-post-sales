import { NextRequest } from 'next/server';
import {
  authenticateRequest,
  createSuccessResponse,
  createErrorResponse,
  ApiError,
} from '@/lib/api/middleware';
import { isAdminEmail } from '@/lib/config/owners';
import { listTouchpointTypes, createNewType } from '@/lib/services/touchpoint-questions';

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!isAdminEmail(auth.email)) throw new ApiError(403, 'Accesso riservato agli admin');

    const types = await listTouchpointTypes();
    return createSuccessResponse({ data: { types } });
  } catch (error) {
    return createErrorResponse(error);
  }
}

/** Crea un nuovo touchpoint_type custom (oltre i 6 seed) con la sua prima versione attiva. */
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!isAdminEmail(auth.email)) throw new ApiError(403, 'Accesso riservato agli admin');

    const body = (await request.json().catch(() => ({}))) as {
      type?: string;
      label?: string;
      description?: string | null;
      systemPrompt?: string;
    };

    const type = (body.type ?? '').trim().toLowerCase();
    const label = (body.label ?? '').trim();
    const systemPrompt = body.systemPrompt ?? '';

    if (!type) throw new ApiError(400, 'type richiesto');
    if (!label) throw new ApiError(400, 'label richiesto');
    if (!systemPrompt.trim()) throw new ApiError(400, 'systemPrompt richiesto');

    let created;
    try {
      created = await createNewType({
        type,
        label,
        description: body.description ?? null,
        systemPrompt,
        createdBy: auth.email ?? auth.userId,
      });
    } catch (e) {
      throw new ApiError(400, e instanceof Error ? e.message : 'Validazione fallita');
    }

    return createSuccessResponse({ data: created }, 201);
  } catch (error) {
    return createErrorResponse(error);
  }
}
