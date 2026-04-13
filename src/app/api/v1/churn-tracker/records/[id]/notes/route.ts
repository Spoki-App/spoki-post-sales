import { NextRequest } from 'next/server';
import { withAuth, createSuccessResponse, createErrorResponse, type RouteHandlerContext, type AuthenticatedRequest } from '@/lib/api/middleware';
import { pgQuery } from '@/lib/db/postgres';

export const GET = withAuth(async (_request: NextRequest, _auth, context?: RouteHandlerContext) => {
  try {
    const { id } = await context!.params;

    const result = await pgQuery(
      `SELECT * FROM churn_notes WHERE churn_record_id = $1 ORDER BY created_at DESC`,
      [id]
    );

    const notes = result.rows.map(r => ({
      id: r.id,
      churnRecordId: r.churn_record_id,
      accountId: r.account_id,
      text: r.text,
      author: r.author,
      createdAt: r.created_at,
    }));

    return createSuccessResponse({ data: notes });
  } catch (error) {
    return createErrorResponse(error, 'Failed to fetch notes');
  }
});

export const POST = withAuth(async (request: NextRequest, auth: AuthenticatedRequest, context?: RouteHandlerContext) => {
  try {
    const { id } = await context!.params;
    const body = await request.json() as { text: string };

    if (!body.text?.trim()) {
      return createErrorResponse(new Error('Text required'), 'Note text is required');
    }

    const recordRes = await pgQuery(
      `SELECT account_id FROM churn_records WHERE id = $1`,
      [id]
    );
    if (recordRes.rowCount === 0) {
      return createErrorResponse(new Error('Not found'), 'Record not found');
    }

    const accountId = recordRes.rows[0].account_id;

    const result = await pgQuery(
      `INSERT INTO churn_notes (churn_record_id, account_id, text, author)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [id, accountId, body.text.trim(), auth.email || 'unknown']
    );

    return createSuccessResponse({
      data: {
        id: result.rows[0].id,
        churnRecordId: result.rows[0].churn_record_id,
        accountId: result.rows[0].account_id,
        text: result.rows[0].text,
        author: result.rows[0].author,
        createdAt: result.rows[0].created_at,
      },
    });
  } catch (error) {
    return createErrorResponse(error, 'Failed to add note');
  }
});
