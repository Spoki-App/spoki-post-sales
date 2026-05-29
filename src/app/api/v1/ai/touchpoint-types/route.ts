import { NextRequest } from 'next/server';
import {
  withAuth,
  createSuccessResponse,
  createErrorResponse,
  type AuthenticatedRequest,
} from '@/lib/api/middleware';
import { listTouchpointTypes } from '@/lib/services/touchpoint-questions';

/**
 * Endpoint pubblico (auth-only, senza vincolo admin) usato dalla modale
 * "Domande call" per popolare la griglia dei tipi disponibili. La gestione
 * dei template (createDraft / activate / createNewType) resta admin-only
 * sotto /admin/touchpoint-templates.
 */
export const GET = withAuth(async (_req: NextRequest, _auth: AuthenticatedRequest) => {
  try {
    const types = await listTouchpointTypes();
    return createSuccessResponse({ data: { types } });
  } catch (error) {
    return createErrorResponse(error, 'Failed to load touchpoint types');
  }
});
