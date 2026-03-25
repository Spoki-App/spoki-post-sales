import { NextRequest } from 'next/server';
import { withAuth, createSuccessResponse, createErrorResponse, type AuthenticatedRequest } from '@/lib/api/middleware';
import { pgQuery } from '@/lib/db/postgres';

export const GET = withAuth(async (_req: NextRequest, _auth: AuthenticatedRequest) => {
  try {
    const res = await pgQuery('SELECT * FROM onboarding_templates ORDER BY name ASC');
    return createSuccessResponse({ data: res.rows });
  } catch (error) {
    return createErrorResponse(error);
  }
});

export const POST = withAuth(async (request: NextRequest, _auth: AuthenticatedRequest) => {
  try {
    const body = await request.json() as {
      name: string; description?: string; planFilter?: string;
      steps: Array<{ id: string; label: string; description?: string }>;
    };

    const res = await pgQuery(
      `INSERT INTO onboarding_templates (name, description, plan_filter, steps)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [body.name, body.description ?? null, body.planFilter ?? null, JSON.stringify(body.steps)]
    );
    return createSuccessResponse({ data: res.rows[0] }, 201);
  } catch (error) {
    return createErrorResponse(error);
  }
});
