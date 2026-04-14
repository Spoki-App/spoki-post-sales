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

    const client = await pgQuery<{ id: string; cs_owner_id: string | null }>(
      `SELECT c.id, c.cs_owner_id FROM clients c WHERE c.id = $1`,
      [clientId]
    );
    const row = client.rows[0];
    if (!row) throw new ApiError(404, 'Cliente non trovato');
    if (row.cs_owner_id !== owner.id) {
      throw new ApiError(403, 'Il cliente non è in portfolio company owner per il tuo utente');
    }

    await pgQuery(
      `INSERT INTO cs_success_pipeline (client_id, owner_hubspot_id, stage, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (client_id) DO UPDATE SET
         stage = EXCLUDED.stage,
         owner_hubspot_id = EXCLUDED.owner_hubspot_id,
         stage_changed_at = NOW(),
         updated_at = NOW()`,
      [clientId, owner.id, body.stage]
    );

    return createSuccessResponse({ data: { ok: true } });
  } catch (error) {
    return createErrorResponse(error);
  }
});
