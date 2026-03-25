import { NextRequest } from 'next/server';
import { withAuth, createSuccessResponse, createErrorResponse, ApiError, type AuthenticatedRequest, type RouteHandlerContext } from '@/lib/api/middleware';
import { pgQuery } from '@/lib/db/postgres';

export const PATCH = withAuth(async (request: NextRequest, _auth: AuthenticatedRequest, context?: RouteHandlerContext) => {
  try {
    const params = await context?.params;
    const id = params?.id as string;
    if (!id) throw new ApiError(400, 'Missing rule id');

    const body = await request.json() as Partial<{
      name: string; description: string; threshold: number; severity: string; enabled: boolean;
    }>;

    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (body.name !== undefined) { fields.push(`name = $${idx++}`); values.push(body.name); }
    if (body.description !== undefined) { fields.push(`description = $${idx++}`); values.push(body.description); }
    if (body.threshold !== undefined) { fields.push(`threshold = $${idx++}`); values.push(body.threshold); }
    if (body.severity !== undefined) { fields.push(`severity = $${idx++}`); values.push(body.severity); }
    if (body.enabled !== undefined) { fields.push(`enabled = $${idx++}`); values.push(body.enabled); }

    if (fields.length === 0) throw new ApiError(400, 'No fields to update');

    values.push(id);
    const res = await pgQuery(
      `UPDATE alert_rules SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${idx} RETURNING *`,
      values
    );
    if (res.rows.length === 0) throw new ApiError(404, 'Rule not found');
    return createSuccessResponse({ data: res.rows[0] });
  } catch (error) {
    return createErrorResponse(error);
  }
});
