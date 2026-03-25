import { NextRequest } from 'next/server';
import { withAuth, createSuccessResponse, createErrorResponse, type AuthenticatedRequest } from '@/lib/api/middleware';
import { pgQuery } from '@/lib/db/postgres';

export const GET = withAuth(async (request: NextRequest, _auth: AuthenticatedRequest) => {
  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
    const pageSize = 50;
    const offset = (page - 1) * pageSize;
    const status = searchParams.get('status') ?? '';
    const assignedTo = searchParams.get('assignedTo') ?? '';
    const clientId = searchParams.get('clientId') ?? '';

    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (status) { conditions.push(`t.status = $${idx++}`); params.push(status); }
    if (assignedTo) { conditions.push(`t.assigned_to = $${idx++}`); params.push(assignedTo); }
    if (clientId) { conditions.push(`t.client_id = $${idx++}`); params.push(clientId); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await pgQuery<{ count: string }>(`SELECT COUNT(*) FROM tasks t ${where}`, params);
    const total = parseInt(countRes.rows[0]?.count ?? '0', 10);

    const rows = await pgQuery<{
      id: string; client_id: string | null; client_name: string | null;
      title: string; description: string | null; status: string; priority: string;
      due_date: string | null; assigned_to: string | null; created_by: string | null;
      completed_at: string | null; created_at: string; updated_at: string;
    }>(
      `SELECT t.id, t.client_id, c.name AS client_name, t.title, t.description,
              t.status, t.priority, t.due_date, t.assigned_to, t.created_by,
              t.completed_at, t.created_at, t.updated_at
       FROM tasks t
       LEFT JOIN clients c ON c.id = t.client_id
       ${where}
       ORDER BY
         CASE t.status WHEN 'todo' THEN 1 WHEN 'in_progress' THEN 2 ELSE 3 END,
         CASE t.priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
         t.due_date ASC NULLS LAST
       LIMIT ${pageSize} OFFSET ${offset}`,
      params
    );

    return createSuccessResponse({
      data: rows.rows.map(r => ({ ...r, clientName: r.client_name, clientId: r.client_id })),
      total, page, pageSize,
    });
  } catch (error) {
    return createErrorResponse(error);
  }
});

export const POST = withAuth(async (request: NextRequest, auth: AuthenticatedRequest) => {
  try {
    const body = await request.json() as {
      clientId?: string; title: string; description?: string;
      priority?: string; dueDate?: string; assignedTo?: string;
    };

    if (!body.title?.trim()) {
      const { ApiError } = await import('@/lib/api/middleware');
      throw new ApiError(400, 'Il titolo del task è obbligatorio');
    }

    const res = await pgQuery<{ id: string }>(
      `INSERT INTO tasks (client_id, title, description, priority, due_date, assigned_to, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        body.clientId ?? null,
        body.title.trim(),
        body.description ?? null,
        body.priority ?? 'medium',
        body.dueDate ? new Date(body.dueDate) : null,
        body.assignedTo ?? auth.email ?? null,
        auth.email ?? null,
      ]
    );

    const task = await pgQuery(`SELECT t.*, c.name AS client_name FROM tasks t LEFT JOIN clients c ON c.id = t.client_id WHERE t.id = $1`, [res.rows[0].id]);
    return createSuccessResponse({ data: task.rows[0] }, 201);
  } catch (error) {
    return createErrorResponse(error);
  }
});
