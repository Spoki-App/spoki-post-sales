import { NextRequest } from 'next/server';
import { withAuth, createSuccessResponse, createErrorResponse, type AuthenticatedRequest } from '@/lib/api/middleware';
import { pgQuery } from '@/lib/db/postgres';

export const GET = withAuth(async (_req: NextRequest, _auth: AuthenticatedRequest) => {
  try {
    const res = await pgQuery('SELECT * FROM alert_rules ORDER BY severity DESC, name ASC');
    return createSuccessResponse({ data: res.rows });
  } catch (error) {
    return createErrorResponse(error);
  }
});

export const POST = withAuth(async (request: NextRequest, _auth: AuthenticatedRequest) => {
  try {
    const body = await request.json() as {
      name: string; description?: string; type: string;
      threshold?: number; severity?: string;
    };

    const res = await pgQuery<{ id: string }>(
      `INSERT INTO alert_rules (name, description, type, threshold, severity)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [body.name, body.description ?? null, body.type, body.threshold ?? null, body.severity ?? 'medium']
    );
    return createSuccessResponse({ data: res.rows[0] }, 201);
  } catch (error) {
    return createErrorResponse(error);
  }
});
