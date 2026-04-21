import { NextRequest, NextResponse } from 'next/server';
import { getHubSpotClient } from '@/lib/hubspot/client';
import { runFullSync } from '@/lib/hubspot/sync';
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
      const mrrEnrichment = await client.enrichCompaniesMrrFromDeals(companies);
      const count = await syncCompaniesOnly(companies);
      logger.info(`Synced ${count} companies; MRR deal enrichment: ${JSON.stringify(mrrEnrichment)}`);
      return NextResponse.json({ success: true, type: 'companies', count, mrrEnrichment });
    }

    if (type === 'purchase-sources') {
      const companyIdsRes = await pgQuery<{ id: string; hubspot_id: string }>('SELECT id, hubspot_id FROM clients');
      const hubspotIds = companyIdsRes.rows.map(r => r.hubspot_id);
      const sources = await client.getPurchaseSourcesForCompanies(hubspotIds);

      const hubspotToId = new Map(companyIdsRes.rows.map(r => [r.hubspot_id, r.id]));
      let updated = 0;
      for (const [hubspotId, source] of Object.entries(sources)) {
        const clientId = hubspotToId.get(hubspotId);
        if (clientId) {
          await pgQuery('UPDATE clients SET purchase_source = $1 WHERE id = $2', [source, clientId]);
          updated++;
        }
      }

      logger.info(`Updated purchase source for ${updated} clients`);
      return NextResponse.json({ success: true, type: 'purchase-sources', count: updated });
    }

    if (type === 'scores') {
      const { calculateAllHealthScores } = await import('@/lib/health-score/calculator');
      const scoreResult = await calculateAllHealthScores();
      return NextResponse.json({
        success: true,
        type: 'scores',
        calculated: scoreResult.calculated,
        alertsCreated: scoreResult.alertsCreated,
        durationMs: scoreResult.durationMs,
      });
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
      const { syncEngagementsOnly, syncContactsOnly } = await import('@/lib/hubspot/sync');

      const companyIdsRes = await pgQuery<{ hubspot_id: string }>('SELECT hubspot_id FROM clients');
      const companyHubspotIds = companyIdsRes.rows.map(r => r.hubspot_id);
      logger.info(`Fetching engagements for ${companyHubspotIds.length} synced companies`);

      const contactsForCompanies =
        companyHubspotIds.length > 0 ? await client.getContactsForCompanies(companyHubspotIds) : [];
      if (contactsForCompanies.length > 0) {
        const n = await syncContactsOnly(contactsForCompanies);
        logger.info(`Synced ${n} contacts from HubSpot company associations before engagement pull`);
      }

      const companyEngagements = await client.getEngagementsForCompanies(companyHubspotIds);

      const contactHubspotIds = [...new Set(contactsForCompanies.map(c => c.id))];
      const contactEngagements =
        contactHubspotIds.length > 0 ? await client.getEngagementsForContacts(contactHubspotIds) : [];
      logger.info(
        `Contact-side engagements: ${contactHubspotIds.length} HubSpot contacts linked to those companies`
      );

      const merged = [...companyEngagements, ...contactEngagements];
      logger.info(`Total engagements to sync: ${merged.length} (${companyEngagements.length} from companies, ${contactEngagements.length} from contacts, duplicates handled by upsert)`);
      const count = await syncEngagementsOnly(merged);
      return NextResponse.json({ success: true, type: 'engagements', count });
    }

    if (type === 'deals') {
      const { syncDealsOnly } = await import('@/lib/hubspot/sync');
      const companyIdsRes = await pgQuery<{ hubspot_id: string }>('SELECT hubspot_id FROM clients');
      const companyHubspotIds = companyIdsRes.rows.map(r => r.hubspot_id);
      logger.info(`Fetching deals for ${companyHubspotIds.length} synced companies`);
      const deals = await client.fetchDealsForCompanies(companyHubspotIds);
      const count = await syncDealsOnly(deals);
      return NextResponse.json({ success: true, type: 'deals', count });
    }

    // Full sync (cron)
    const syncResult = await runFullSync();
    return NextResponse.json({ success: true, sync: syncResult });
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

// Manual trigger: GET /api/v1/hubspot/sync?secret=<CRON_SECRET>&type=companies|contacts|tickets|engagements
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  return handleSync(searchParams.get('type'));
}
