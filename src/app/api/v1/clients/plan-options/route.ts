import { NextRequest } from 'next/server';
import { withAuth, createSuccessResponse, createErrorResponse, type AuthenticatedRequest } from '@/lib/api/middleware';
import { pgQuery } from '@/lib/db/postgres';

export const GET = withAuth(async (_request: NextRequest, _auth: AuthenticatedRequest) => {
  try {
    const res = await pgQuery<{ plan: string }>(
      `SELECT DISTINCT plan
         FROM clients
        WHERE plan IS NOT NULL AND plan <> ''
        ORDER BY plan ASC`
    );

    const data = res.rows.map(r => r.plan);
    return createSuccessResponse({ data });
  } catch (error) {
    return createErrorResponse(error);
  }
});
