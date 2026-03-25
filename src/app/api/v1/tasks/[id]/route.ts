import { NextRequest } from 'next/server';
import { withAuth, createSuccessResponse, createErrorResponse, ApiError, type AuthenticatedRequest, type RouteHandlerContext } from '@/lib/api/middleware';
import { pgQuery } from '@/lib/db/postgres';

export const PATCH = withAuth(async (request: NextRequest, _auth: AuthenticatedRequest, context?: RouteHandlerContext) => {
  try {
    const params = await context?.params;
    const id = params?.id as string;
    if (!id) throw new ApiError(400, 'Missing task id');

    const body = await request.json() as Partial<{
      title: string; description: string; status: string;
      priority: string; dueDate: string; assignedTo: string;
    }>;

    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (body.title !== undefined) { fields.push(`title = $${idx++}`); values.push(body.title); }
    if (body.description !== undefined) { fields.push(`description = $${idx++}`); values.push(body.description); }
    if (body.status !== undefined) {
      fields.push(`status = $${idx++}`);
      values.push(body.status);
      if (body.status === 'done') {
        fields.push(`completed_at = NOW()`);
      }
    }
    if (body.priority !== undefined) { fields.push(`priority = $${idx++}`); values.push(body.priority); }
    if (body.dueDate !== undefined) { fields.push(`due_date = $${idx++}`); values.push(body.dueDate ? new Date(body.dueDate) : null); }
    if (body.assignedTo !== undefined) { fields.push(`assigned_to = $${idx++}`); values.push(body.assignedTo); }

    if (fields.length === 0) throw new ApiError(400, 'No fields to update');

    values.push(id);
    const res = await pgQuery(
      `UPDATE tasks SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${idx} RETURNING *`,
      values
    );

    if (res.rows.length === 0) throw new ApiError(404, 'Task not found');
    return createSuccessResponse({ data: res.rows[0] });
  } catch (error) {
    return createErrorResponse(error);
  }
});

export const DELETE = withAuth(async (_req: NextRequest, _auth: AuthenticatedRequest, context?: RouteHandlerContext) => {
  try {
    const params = await context?.params;
    const id = params?.id as string;
    if (!id) throw new ApiError(400, 'Missing task id');

    const res = await pgQuery('DELETE FROM tasks WHERE id = $1 RETURNING id', [id]);
    if (res.rows.length === 0) throw new ApiError(404, 'Task not found');
    return createSuccessResponse({ data: null });
  } catch (error) {
    return createErrorResponse(error);
  }
});
