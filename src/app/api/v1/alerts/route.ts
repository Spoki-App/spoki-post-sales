import { NextRequest } from 'next/server';
import { withAuth, createSuccessResponse, createErrorResponse, type AuthenticatedRequest } from '@/lib/api/middleware';
import { pgQuery } from '@/lib/db/postgres';

export const GET = withAuth(async (request: NextRequest, _auth: AuthenticatedRequest) => {
  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
    const pageSize = 30;
    const offset = (page - 1) * pageSize;
    const resolvedParam = searchParams.get('resolved');
    const resolved = resolvedParam === 'true' ? true : resolvedParam === 'false' ? false : false;

    const countRes = await pgQuery<{ count: string }>(
      'SELECT COUNT(*) FROM alerts WHERE resolved = $1',
      [resolved]
    );
    const total = parseInt(countRes.rows[0]?.count ?? '0', 10);

    const rows = await pgQuery<{
      id: string; client_id: string; client_name: string | null; rule_id: string | null;
      type: string; severity: string; message: string; metadata: unknown;
      read_by: string[]; resolved: boolean; resolved_at: string | null; triggered_at: string;
    }>(
      `SELECT a.id, a.client_id, c.name AS client_name, a.rule_id,
              a.type, a.severity, a.message, a.metadata,
              a.read_by, a.resolved, a.resolved_at, a.triggered_at
       FROM alerts a
       LEFT JOIN clients c ON c.id = a.client_id
       WHERE a.resolved = $1
       ORDER BY a.triggered_at DESC
       LIMIT ${pageSize} OFFSET ${offset}`,
      [resolved]
    );

    return createSuccessResponse({
      data: rows.rows.map(r => ({
        id: r.id, clientId: r.client_id, clientName: r.client_name,
        ruleId: r.rule_id, type: r.type, severity: r.severity,
        message: r.message, metadata: r.metadata,
        readBy: r.read_by ?? [], resolved: r.resolved,
        resolvedAt: r.resolved_at, triggeredAt: r.triggered_at,
      })),
      total, page, pageSize,
    });
  } catch (error) {
    return createErrorResponse(error);
  }
});
