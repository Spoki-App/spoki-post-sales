import { NextRequest } from 'next/server';
import {
  withAuth,
  createSuccessResponse,
  createErrorResponse,
  type AuthenticatedRequest,
} from '@/lib/api/middleware';
import { pgQuery } from '@/lib/db/postgres';
import { sqlContactPersonPickOrder } from '@/lib/db/contact-person-pick-order';
import { planUsageFromRawProperties } from '@/lib/clients/plan-usage-from-raw';
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
      contact_first_name: string | null;
      contact_last_name: string | null;
      contact_email: string | null;
      contact_hubspot_id: string | null;
      raw_properties: unknown;
    }>(
      `SELECT c.id, c.hubspot_id, c.name, c.domain, c.plan, c.mrr, c.renewal_date, c.raw_properties,
              cp.first_name AS contact_first_name,
              cp.last_name AS contact_last_name,
              cp.email AS contact_email,
              cp.hubspot_id AS contact_hubspot_id
       FROM clients c
       LEFT JOIN LATERAL (
         SELECT first_name, last_name, email, hubspot_id
         FROM contacts
         WHERE client_id = c.id
         ${sqlContactPersonPickOrder('c.raw_properties')}
         LIMIT 1
       ) cp ON true
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
      contactPerson: r.contact_hubspot_id
        ? {
            firstName: r.contact_first_name,
            lastName: r.contact_last_name,
            email: r.contact_email,
            hubspotId: r.contact_hubspot_id,
          }
        : null,
      planUsage: planUsageFromRawProperties(r.raw_properties),
    }));

    return createSuccessResponse({ data, total, page, pageSize });
  } catch (error) {
    return createErrorResponse(error);
  }
});
