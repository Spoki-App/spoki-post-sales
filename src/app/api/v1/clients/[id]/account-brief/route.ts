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
import { MARCO_MANIGRASSI_HUBSPOT_OWNER_ID } from '@/lib/config/owners';
import { buildAccountBriefContext } from '@/lib/account-brief/build-context';
import { generateAccountBriefWithAi } from '@/lib/account-brief/generate';

export const maxDuration = 60;

export const POST = withAuth(async (_req: NextRequest, _auth: AuthenticatedRequest, context?: RouteHandlerContext) => {
  try {
    const params = await context?.params;
    const id = params?.id as string;
    if (!id) throw new ApiError(400, 'Missing client id');

    const clientRes = await pgQuery<{ cs_owner_id: string | null }>(
      `SELECT cs_owner_id FROM clients WHERE id = $1`,
      [id]
    );
    const client = clientRes.rows[0];
    if (!client) throw new ApiError(404, 'Client not found');

    if (client.cs_owner_id !== MARCO_MANIGRASSI_HUBSPOT_OWNER_ID) {
      throw new ApiError(
        403,
        'Account brief disponibile solo per i clienti con company owner Marco Manigrassi in HubSpot.'
      );
    }

    const briefContext = await buildAccountBriefContext(id);
    const { sections, model, fallback } = await generateAccountBriefWithAi(briefContext);

    return createSuccessResponse({
      data: {
        generatedAt: new Date().toISOString(),
        context: briefContext,
        sections,
        model,
        fallback,
      },
    });
  } catch (error) {
    return createErrorResponse(error);
  }
});
