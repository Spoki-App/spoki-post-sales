import { NextRequest } from 'next/server';
import {
  withAuth,
  createSuccessResponse,
  createErrorResponse,
  ApiError,
  type AuthenticatedRequest,
} from '@/lib/api/middleware';
import { pgQuery } from '@/lib/db/postgres';
import { requireCsOwner } from '@/lib/customer-success/require-cs-owner';
import { isCsPipelineStage } from '@/lib/config/cs-pipeline';

export const GET = withAuth(async (_req: NextRequest, auth: AuthenticatedRequest) => {
  try {
    const owner = requireCsOwner(auth);
    const res = await pgQuery<{
      client_id: string;
      stage: string;
      name: string;
      hubspot_id: string;
      mrr: string | null;
      activated_at: string | null;
      has_pipeline_row: boolean;
    }>(
      `SELECT c.id AS client_id,
              COALESCE(p.stage, 'welcome_call') AS stage,
              c.name, c.hubspot_id, c.mrr,
              ob.activated_at,
              (p.client_id IS NOT NULL) AS has_pipeline_row
       FROM clients c
       LEFT JOIN cs_success_pipeline p
         ON p.client_id = c.id AND p.owner_hubspot_id = $1
       LEFT JOIN LATERAL (
         SELECT activated_at FROM tickets
         WHERE client_id = c.id AND pipeline = '0'
         ORDER BY opened_at DESC LIMIT 1
       ) ob ON true
       WHERE c.cs_owner_id = $1
       ORDER BY c.name ASC`,
      [owner.id]
    );

    return createSuccessResponse({
      data: {
        cards: res.rows.map(r => ({
          clientId: r.client_id,
          stage: r.stage,
          name: r.name,
          hubspotId: r.hubspot_id,
          mrr: r.mrr ? parseFloat(r.mrr) : null,
          activatedAt: r.activated_at,
          hasPipelineRow: r.has_pipeline_row,
        })),
      },
    });
  } catch (error) {
    return createErrorResponse(error);
  }
});

export const POST = withAuth(async (request: NextRequest, auth: AuthenticatedRequest) => {
  try {
    const owner = requireCsOwner(auth);
    const body = (await request.json()) as { clientId?: string; stage?: string };
    if (!body.clientId) throw new ApiError(400, 'clientId richiesto');
    const stage = body.stage && isCsPipelineStage(body.stage) ? body.stage : 'welcome_call';

    const client = await pgQuery<{ id: string; cs_owner_id: string | null }>(
      `SELECT c.id, c.cs_owner_id FROM clients c WHERE c.id = $1`,
      [body.clientId]
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
      [body.clientId, owner.id, stage]
    );

    return createSuccessResponse({ data: { ok: true } });
  } catch (error) {
    return createErrorResponse(error);
  }
});
