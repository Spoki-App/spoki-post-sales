import { NextRequest } from 'next/server';
import { withAuth, createSuccessResponse, createErrorResponse } from '@/lib/api/middleware';
import { pgQuery } from '@/lib/db/postgres';
import { CHURN_STATUSES } from '@/types/churn';

export const POST = withAuth(async (request: NextRequest) => {
  try {
    const body = await request.json() as {
      ids: string[];
      action: 'status' | 'assign';
      status?: string;
      assignedTo?: { name: string; email?: string } | null;
    };

    if (!body.ids?.length) {
      return createErrorResponse(new Error('No ids'), 'ids array is required');
    }

    let updated = 0;

    if (body.action === 'status' && body.status) {
      if (!CHURN_STATUSES.includes(body.status as typeof CHURN_STATUSES[number])) {
        return createErrorResponse(new Error('Invalid status'), 'Invalid status');
      }
      const placeholders = body.ids.map((_, i) => `$${i + 3}`);
      const result = await pgQuery(
        `UPDATE churn_records SET status = $1, status_changed_at = NOW() WHERE id IN (${placeholders.join(',')})`,
        [body.status, ...body.ids]
      );
      updated = result.rowCount ?? 0;
    } else if (body.action === 'assign') {
      const placeholders = body.ids.map((_, i) => `$${i + 2}`);
      const result = await pgQuery(
        `UPDATE churn_records SET assigned_to = $1 WHERE id IN (${placeholders.join(',')})`,
        [body.assignedTo ? JSON.stringify(body.assignedTo) : null, ...body.ids]
      );
      updated = result.rowCount ?? 0;
    }

    return createSuccessResponse({ data: { updated } });
  } catch (error) {
    return createErrorResponse(error, 'Failed to perform batch action');
  }
});
