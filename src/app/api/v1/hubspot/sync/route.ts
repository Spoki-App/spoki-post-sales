import { NextRequest, NextResponse } from 'next/server';
import { getHubSpotClient } from '@/lib/hubspot/client';
import { runFullSync } from '@/lib/hubspot/sync';
import { calculateAllHealthScores } from '@/lib/health-score/calculator';
import { verifyCronRequest } from '@/lib/api/middleware';
import { pgQuery } from '@/lib/db/postgres';
import { getLogger } from '@/lib/logger';

const logger = getLogger('api:hubspot:sync');

function isAuthorized(request: NextRequest): boolean {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('secret');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true; // open in dev
  return secret === cronSecret;
}

async function handleSync(type: string | null): Promise<NextResponse> {
  const client = getHubSpotClient();

  try {
    if (type === 'companies') {
      const { syncCompaniesOnly } = await import('@/lib/hubspot/sync');
      const companies = await client.getCompanies();
      const count = await syncCompaniesOnly(companies);
      logger.info(`Synced ${count} companies`);
      return NextResponse.json({ success: true, type: 'companies', count });
    }

    if (type === 'contacts') {
      const { syncContactsOnly } = await import('@/lib/hubspot/sync');
      // Fetch only contacts associated with companies already in the DB
      const companyIdsRes = await pgQuery<{ hubspot_id: string }>('SELECT hubspot_id FROM clients');
      const companyHubspotIds = companyIdsRes.rows.map(r => r.hubspot_id);
      logger.info(`Fetching contacts for ${companyHubspotIds.length} synced companies`);
      const contacts = await client.getContactsForCompanies(companyHubspotIds);
      const count = await syncContactsOnly(contacts);
      return NextResponse.json({ success: true, type: 'contacts', count });
    }

    if (type === 'tickets') {
      const { syncTicketsOnly } = await import('@/lib/hubspot/sync');
      const tickets = await client.getTickets();
      const count = await syncTicketsOnly(tickets);
      return NextResponse.json({ success: true, type: 'tickets', count });
    }

    if (type === 'engagements') {
      const { syncEngagementsOnly } = await import('@/lib/hubspot/sync');

      const companyIdsRes = await pgQuery<{ hubspot_id: string }>('SELECT hubspot_id FROM clients');
      const companyHubspotIds = companyIdsRes.rows.map(r => r.hubspot_id);
      logger.info(`Fetching engagements for ${companyHubspotIds.length} synced companies`);
      const companyEngagements = await client.getEngagementsForCompanies(companyHubspotIds);

      const contactIdsRes = await pgQuery<{ hubspot_id: string }>('SELECT hubspot_id FROM contacts WHERE client_id IS NOT NULL');
      const contactHubspotIds = contactIdsRes.rows.map(r => r.hubspot_id);
      logger.info(`Fetching engagements for ${contactHubspotIds.length} synced contacts`);
      const contactEngagements = await client.getEngagementsForContacts(contactHubspotIds);

      const seen = new Set(companyEngagements.map(e => e.id));
      const merged = [...companyEngagements];
      for (const e of contactEngagements) {
        if (!seen.has(e.id)) {
          merged.push(e);
          seen.add(e.id);
        }
      }

      logger.info(`Total unique engagements: ${merged.length} (${companyEngagements.length} from companies, ${contactEngagements.length} from contacts)`);
      const count = await syncEngagementsOnly(merged);
      return NextResponse.json({ success: true, type: 'engagements', count });
    }

    if (type === 'scores') {
      const result = await calculateAllHealthScores();
      return NextResponse.json({ success: true, type: 'scores', ...result });
    }

    // Full sync (cron)
    const syncResult = await runFullSync();
    const healthResult = await calculateAllHealthScores();
    return NextResponse.json({ success: true, sync: syncResult, healthScores: healthResult });
  } catch (error) {
    logger.error('Sync failed', { type, error: String(error) });
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

// Vercel cron (Authorization: Bearer <CRON_SECRET>)
export async function POST(request: NextRequest) {
  if (!verifyCronRequest(request)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  return handleSync(null);
}

// Manual trigger: GET /api/v1/hubspot/sync?secret=<CRON_SECRET>&type=companies|contacts|tickets|engagements|scores
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  return handleSync(searchParams.get('type'));
}
