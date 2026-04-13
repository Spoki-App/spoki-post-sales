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

const ACTIVATED_ONBOARDING_STATUS = '2';

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
    }>(
      `SELECT p.client_id, p.stage, c.name, c.hubspot_id, c.mrr,
              ob.activated_at
       FROM cs_success_pipeline p
       JOIN clients c ON c.id = p.client_id
       LEFT JOIN LATERAL (
         SELECT activated_at FROM tickets
         WHERE client_id = c.id AND pipeline = '0'
         ORDER BY opened_at DESC LIMIT 1
       ) ob ON true
       WHERE p.owner_hubspot_id = $1
       ORDER BY p.stage_changed_at DESC`,
      [owner.id]
    );

    const eligible = await pgQuery<{
      id: string;
      hubspot_id: string;
      name: string;
      mrr: string | null;
    }>(
      `SELECT c.id, c.hubspot_id, c.name, c.mrr
       FROM clients c
       INNER JOIN LATERAL (
         SELECT status FROM tickets
         WHERE client_id = c.id AND pipeline = '0' AND closed_at IS NULL
         ORDER BY opened_at DESC LIMIT 1
       ) ob ON ob.status = $2
       WHERE c.cs_owner_id = $1
         AND c.id NOT IN (SELECT client_id FROM cs_success_pipeline WHERE owner_hubspot_id = $1)
       ORDER BY c.name ASC
       LIMIT 200`,
      [owner.id, ACTIVATED_ONBOARDING_STATUS]
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
        })),
        eligibleToAdd: eligible.rows.map(r => ({
          id: r.id,
          hubspotId: r.hubspot_id,
          name: r.name,
          mrr: r.mrr ? parseFloat(r.mrr) : null,
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
    const body = (await request.json()) as { clientId?: string };
    if (!body.clientId) throw new ApiError(400, 'clientId richiesto');

    const client = await pgQuery<{
      id: string;
      cs_owner_id: string | null;
      activated: boolean;
    }>(
      `SELECT c.id, c.cs_owner_id,
        EXISTS (
          SELECT 1 FROM tickets t
          WHERE t.client_id = c.id AND t.pipeline = '0' AND t.closed_at IS NULL AND t.status = $2
          LIMIT 1
        ) AS activated
       FROM clients c WHERE c.id = $1`,
      [body.clientId, ACTIVATED_ONBOARDING_STATUS]
    );
    const row = client.rows[0];
    if (!row) throw new ApiError(404, 'Cliente non trovato');
    if (row.cs_owner_id !== owner.id) throw new ApiError(403, 'Il cliente non è in portfolio company owner per il tuo utente');
    if (!row.activated) throw new ApiError(400, 'Il cliente deve aver completato l\'attivazione (onboarding) prima di entrare in pipeline CS');

    await pgQuery(
      `INSERT INTO cs_success_pipeline (client_id, owner_hubspot_id, stage, updated_at)
       VALUES ($1, $2, 'welcome_call', NOW())
       ON CONFLICT (client_id) DO UPDATE SET
         stage = EXCLUDED.stage,
         owner_hubspot_id = EXCLUDED.owner_hubspot_id,
         stage_changed_at = NOW(),
         updated_at = NOW()`,
      [body.clientId, owner.id]
    );

    return createSuccessResponse({ data: { ok: true } });
  } catch (error) {
    return createErrorResponse(error);
  }
});
