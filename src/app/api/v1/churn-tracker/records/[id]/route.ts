import { NextRequest } from 'next/server';
import { withAuth, createSuccessResponse, createErrorResponse, type RouteHandlerContext } from '@/lib/api/middleware';
import { pgQuery } from '@/lib/db/postgres';
import { CHURN_STATUSES } from '@/types/churn';

export const PATCH = withAuth(async (request: NextRequest, _auth, context?: RouteHandlerContext) => {
  try {
    const { id } = await context!.params;

    const body = await request.json() as Record<string, unknown>;
    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (body.status !== undefined) {
      if (!CHURN_STATUSES.includes(body.status as typeof CHURN_STATUSES[number])) {
        return createErrorResponse(new Error('Invalid status'), 'Invalid status');
      }
      sets.push(`status = $${idx++}`);
      params.push(body.status);
      sets.push(`status_changed_at = NOW()`);
    }

    if (body.churnReason !== undefined) {
      sets.push(`churn_reason = $${idx++}`);
      params.push(body.churnReason || null);
    }

    if (body.contactOutcome !== undefined) {
      sets.push(`contact_outcome = $${idx++}`);
      params.push(body.contactOutcome || null);
    }

    if (body.assignedTo !== undefined) {
      sets.push(`assigned_to = $${idx++}`);
      params.push(body.assignedTo ? JSON.stringify(body.assignedTo) : null);
    }

    if (sets.length === 0) {
      return createSuccessResponse({ data: null });
    }

    params.push(id);
    const result = await pgQuery(
      `UPDATE churn_records SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );

    if (result.rowCount === 0) {
      return createErrorResponse(new Error('Not found'), 'Record not found');
    }

    return createSuccessResponse({ data: result.rows[0] });
  } catch (error) {
    return createErrorResponse(error, 'Failed to update churn record');
  }
});
