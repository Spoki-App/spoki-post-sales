import { NextRequest } from 'next/server';
import { withAuth, createSuccessResponse, createErrorResponse, ApiError, type AuthenticatedRequest, type RouteHandlerContext } from '@/lib/api/middleware';
import { pgQuery } from '@/lib/db/postgres';

export const GET = withAuth(async (_req: NextRequest, _auth: AuthenticatedRequest, context?: RouteHandlerContext) => {
  try {
    const params = await context?.params;
    const clientId = params?.id as string;
    if (!clientId) throw new ApiError(400, 'Missing client id');

    const res = await pgQuery<{
      id: string; client_id: string; title: string; description: string | null;
      status: string; source: string; source_engagement_id: string | null;
      mentioned_at: string | null; due_date: string | null;
      created_by: string | null; created_at: string; updated_at: string;
    }>(
      `SELECT id, client_id, title, description, status, source,
              source_engagement_id, mentioned_at, due_date,
              created_by, created_at, updated_at
       FROM client_goals
       WHERE client_id = $1
       ORDER BY
         CASE status WHEN 'active' THEN 0 WHEN 'achieved' THEN 1 ELSE 2 END,
         mentioned_at DESC NULLS LAST,
         created_at DESC`,
      [clientId]
    );

    return createSuccessResponse({
      data: res.rows.map(r => ({
        id: r.id,
        clientId: r.client_id,
        title: r.title,
        description: r.description,
        status: r.status,
        source: r.source,
        sourceEngagementId: r.source_engagement_id,
        mentionedAt: r.mentioned_at,
        dueDate: r.due_date,
        createdBy: r.created_by,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
    });
  } catch (error) {
    return createErrorResponse(error);
  }
});

export const POST = withAuth(async (req: NextRequest, auth: AuthenticatedRequest, context?: RouteHandlerContext) => {
  try {
    const params = await context?.params;
    const clientId = params?.id as string;
    if (!clientId) throw new ApiError(400, 'Missing client id');

    const body = await req.json() as { title?: string; description?: string; dueDate?: string };
    if (!body.title?.trim()) throw new ApiError(400, 'Title is required');

    const res = await pgQuery<{ id: string }>(
      `INSERT INTO client_goals (client_id, title, description, due_date, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [clientId, body.title.trim(), body.description?.trim() || null, body.dueDate || null, auth.email || auth.userId]
    );

    return createSuccessResponse({ data: { id: res.rows[0].id } }, 201);
  } catch (error) {
    return createErrorResponse(error);
  }
});

export const PATCH = withAuth(async (req: NextRequest, _auth: AuthenticatedRequest, context?: RouteHandlerContext) => {
  try {
    const params = await context?.params;
    const clientId = params?.id as string;
    if (!clientId) throw new ApiError(400, 'Missing client id');

    const body = await req.json() as { goalId?: string; title?: string; description?: string; status?: string; dueDate?: string };
    if (!body.goalId) throw new ApiError(400, 'goalId is required');

    const sets: string[] = [];
    const vals: unknown[] = [];
    let idx = 1;

    if (body.title !== undefined) { sets.push(`title = $${idx++}`); vals.push(body.title.trim()); }
    if (body.description !== undefined) { sets.push(`description = $${idx++}`); vals.push(body.description.trim() || null); }
    if (body.status !== undefined) { sets.push(`status = $${idx++}`); vals.push(body.status); }
    if (body.dueDate !== undefined) { sets.push(`due_date = $${idx++}`); vals.push(body.dueDate || null); }

    if (sets.length === 0) throw new ApiError(400, 'No fields to update');

    vals.push(body.goalId, clientId);
    await pgQuery(
      `UPDATE client_goals SET ${sets.join(', ')} WHERE id = $${idx++} AND client_id = $${idx}`,
      vals
    );

    return createSuccessResponse({ data: { updated: true } });
  } catch (error) {
    return createErrorResponse(error);
  }
});
