import { NextRequest } from 'next/server';
import { withAuth, createSuccessResponse, createErrorResponse, type AuthenticatedRequest } from '@/lib/api/middleware';
import { pgQuery } from '@/lib/db/postgres';
import { HUBSPOT_OWNERS, type HubSpotOwner } from '@/lib/config/owners';

export const GET = withAuth(async (_request: NextRequest, _auth: AuthenticatedRequest) => {
  try {
    const res = await pgQuery<{ cs_owner_id: string }>(
      `SELECT DISTINCT cs_owner_id
         FROM clients
        WHERE cs_owner_id IS NOT NULL`
    );

    const data = res.rows
      .map(r => HUBSPOT_OWNERS[r.cs_owner_id])
      .filter((o): o is HubSpotOwner => Boolean(o))
      .sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`, 'it'))
      .map(o => ({ id: o.id, firstName: o.firstName, lastName: o.lastName, team: o.team }));

    return createSuccessResponse({ data });
  } catch (error) {
    return createErrorResponse(error);
  }
});
