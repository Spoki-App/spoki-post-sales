import { NextRequest } from 'next/server';
import {
  withAuth,
  createSuccessResponse,
  createErrorResponse,
  type AuthenticatedRequest,
} from '@/lib/api/middleware';
import { pgQuery } from '@/lib/db/postgres';
import { requireCsOwner } from '@/lib/customer-success/require-cs-owner';

export const GET = withAuth(async (request: NextRequest, auth: AuthenticatedRequest) => {
  try {
    const owner = requireCsOwner(auth);
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
    const pageSize = 50;
    const offset = (page - 1) * pageSize;
    const q = searchParams.get('q') ?? '';

    const conditions: string[] = ['c.cs_owner_id = $1'];
    const params: unknown[] = [owner.id];
    let idx = 2;
    if (q) {
      conditions.push(`(c.name ILIKE $${idx} OR c.domain ILIKE $${idx})`);
      params.push(`%${q}%`);
      idx++;
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const countRes = await pgQuery<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM clients c ${where}`,
      params
    );
    const total = parseInt(countRes.rows[0]?.count ?? '0', 10);

    const rows = await pgQuery<{
      id: string;
      hubspot_id: string;
      name: string;
      domain: string | null;
      plan: string | null;
      mrr: string | null;
      renewal_date: string | null;
    }>(
      `SELECT c.id, c.hubspot_id, c.name, c.domain, c.plan, c.mrr, c.renewal_date
       FROM clients c
       ${where}
       ORDER BY c.name ASC
       LIMIT ${pageSize} OFFSET ${offset}`,
      params
    );

    const data = rows.rows.map(r => ({
      id: r.id,
      hubspotId: r.hubspot_id,
      name: r.name,
      domain: r.domain,
      plan: r.plan,
      mrr: r.mrr ? parseFloat(r.mrr) : null,
      renewalDate: r.renewal_date,
    }));

    return createSuccessResponse({ data, total, page, pageSize });
  } catch (error) {
    return createErrorResponse(error);
  }
});
