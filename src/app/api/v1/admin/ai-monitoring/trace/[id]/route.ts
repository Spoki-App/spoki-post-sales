import { NextRequest } from 'next/server';
import {
  withAuth,
  createSuccessResponse,
  createErrorResponse,
  ApiError,
  type AuthenticatedRequest,
  type RouteHandlerContext,
} from '@/lib/api/middleware';
import { isAdminEmail } from '@/lib/config/owners';
import { getTrace } from '@/lib/services/langfuse-api';

export const GET = withAuth(async (
  _request: NextRequest,
  auth: AuthenticatedRequest,
  context?: RouteHandlerContext,
) => {
  try {
    if (!isAdminEmail(auth.email)) throw new ApiError(403, 'Accesso riservato agli admin');

    const params = await context!.params;
    const raw = params.id;
    const id = (Array.isArray(raw) ? raw[0] : raw ?? '').trim();
    if (!id) throw new ApiError(400, 'Parametro id mancante');

    const item = await getTrace(id);
    return createSuccessResponse({ data: item });
  } catch (error) {
    return createErrorResponse(error);
  }
});
