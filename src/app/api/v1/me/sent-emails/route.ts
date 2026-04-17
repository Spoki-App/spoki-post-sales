import { NextRequest } from 'next/server';
import { withAuth, createSuccessResponse, createErrorResponse, type AuthenticatedRequest } from '@/lib/api/middleware';
import { getOwnerByEmail } from '@/lib/config/owners';
import { pgQuery } from '@/lib/db/postgres';

const DAYS_WINDOW = 120;

export const GET = withAuth(async (_req: NextRequest, auth: AuthenticatedRequest) => {
  try {
    const owner = getOwnerByEmail(auth.email);
    if (!owner) {
      return createSuccessResponse({
        data: {
          ownerMapped: false as const,
          emails: [] as unknown[],
          stats: { total: 0, last30Days: 0, windowDays: DAYS_WINDOW },
        },
      });
    }

    const ownerId = owner.id;
    const ownerEmail = owner.email.toLowerCase().trim();

    const res = await pgQuery<{
      hubspot_id: string;
      occurred_at: string;
      subject: string | null;
      to_email: string | null;
      client_id: string;
      client_name: string;
      client_hubspot_id: string | null;
    }>(
      `SELECT e.hubspot_id,
              e.occurred_at,
              NULLIF(TRIM(COALESCE(e.raw_properties::jsonb->>'hs_email_subject', e.title, '')), '') AS subject,
              e.raw_properties::jsonb->>'hs_email_to_email' AS to_email,
              COALESCE(cd.id, cc.id) AS client_id,
              COALESCE(cd.name, cc.name) AS client_name,
              COALESCE(cd.hubspot_id, cc.hubspot_id) AS client_hubspot_id
       FROM engagements e
       LEFT JOIN clients cd ON cd.id = e.client_id
       LEFT JOIN contacts co ON co.id = e.contact_id
       LEFT JOIN clients cc ON cc.id = co.client_id
       WHERE e.type = 'EMAIL'
         AND e.occurred_at >= NOW() - ($1::integer * INTERVAL '1 day')
         AND COALESCE(cd.id, cc.id) IS NOT NULL
         AND (
           e.owner_id = $2
           OR LOWER(TRIM(COALESCE(e.raw_properties::jsonb->>'hs_email_from_email', ''))) = $3
         )
       ORDER BY e.occurred_at DESC
       LIMIT 60`,
      [DAYS_WINDOW, ownerId, ownerEmail]
    );

    const now = Date.now();
    const ms30 = 30 * 24 * 60 * 60 * 1000;
    const rows = res.rows.map(r => ({
      hubspotId: r.hubspot_id,
      occurredAt: r.occurred_at,
      subject: r.subject || '(Senza oggetto)',
      toEmail: r.to_email,
      clientId: r.client_id,
      clientName: r.client_name,
      clientHubspotId: r.client_hubspot_id,
    }));

    const last30Days = rows.filter(r => now - new Date(r.occurredAt).getTime() <= ms30).length;

    return createSuccessResponse({
      data: {
        ownerMapped: true as const,
        ownerName: `${owner.firstName} ${owner.lastName}`,
        emails: rows,
        stats: {
          total: rows.length,
          last30Days,
          windowDays: DAYS_WINDOW,
        },
      },
    });
  } catch (error) {
    return createErrorResponse(error);
  }
});
