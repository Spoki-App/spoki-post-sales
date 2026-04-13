import { NextRequest } from 'next/server';
import {
  withAuth,
  createSuccessResponse,
  createErrorResponse,
  ApiError,
  type AuthenticatedRequest,
  type RouteHandlerContext,
} from '@/lib/api/middleware';
import { pgQuery } from '@/lib/db/postgres';
import { requireCsOwner } from '@/lib/customer-success/require-cs-owner';
import { isCsPipelineStage } from '@/lib/config/cs-pipeline';

export const PATCH = withAuth(async (request: NextRequest, auth: AuthenticatedRequest, context?: RouteHandlerContext) => {
  try {
    const owner = requireCsOwner(auth);
    const params = await context?.params;
    const clientId = params?.clientId as string;
    if (!clientId) throw new ApiError(400, 'clientId mancante');

    const body = (await request.json()) as { stage?: string };
    if (!body.stage || !isCsPipelineStage(body.stage)) {
      throw new ApiError(400, 'stage non valida');
    }

    const upd = await pgQuery<{ n: string }>(
      `UPDATE cs_success_pipeline
       SET stage = $1, stage_changed_at = NOW(), updated_at = NOW()
       WHERE client_id = $2 AND owner_hubspot_id = $3
       RETURNING '1' AS n`,
      [body.stage, clientId, owner.id]
    );
    if (upd.rows.length === 0) throw new ApiError(404, 'Card pipeline non trovata');

    return createSuccessResponse({ data: { ok: true } });
  } catch (error) {
    return createErrorResponse(error);
  }
});
