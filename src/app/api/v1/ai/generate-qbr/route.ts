import { NextRequest } from 'next/server';
import { withAuth, createSuccessResponse, createErrorResponse, ApiError } from '@/lib/api/middleware';
import { pgQuery } from '@/lib/db/postgres';
import { generateQbrIntro } from '@/lib/services/gemini';
import { HUBSPOT_OWNERS, getOwnerName } from '@/lib/config/owners';
import { fetchQbrUsageData } from '@/lib/services/qbr-metabase';
import { getLogger } from '@/lib/logger';

const logger = getLogger('api:generate-qbr');

function formatCurrency(n: number): string {
  return n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmt(n: number): string {
  return n.toLocaleString('it-IT');
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split('-');
  return new Date(parseInt(y), parseInt(m) - 1).toLocaleString('it-IT', { month: 'long' });
}

function buildUsageSlideContent(
  usage: Awaited<ReturnType<typeof fetchQbrUsageData>>,
  clientName: string,
): string {
  if (!usage.accountId) {
    return `Non sono disponibili dati di utilizzo per ${clientName} in questo momento.\n\nContattaci per maggiori informazioni sul tuo account.`;
  }

  const lines: string[] = [];

  // KPI principali
  lines.push('--- RIEPILOGO ULTIMI 3 MESI ---');
  lines.push('');

  if (usage.totalMessages3m > 0) {
    lines.push(`Messaggi totali scambiati: ${fmt(usage.totalMessages3m)}`);
    if (usage.messagesOutbound > 0 && usage.messagesInbound > 0) {
      const ratio = (usage.messagesOutbound / usage.messagesInbound).toFixed(1);
      lines.push(`Rapporto outbound/inbound: ${ratio}:1 (${fmt(usage.messagesOutbound)} inviati, ${fmt(usage.messagesInbound)} ricevuti)`);
    }
  }

  if (usage.billingPeriods.length > 0) {
    lines.push('');
    lines.push('Conversazioni per periodo di fatturazione:');
    for (const bp of usage.billingPeriods) {
      const fmtDate = (d: string) => d.split('-').reverse().join('/');
      const label = `${fmtDate(bp.periodStart)} - ${fmtDate(bp.periodEnd)}`;
      const limit = bp.conversationsIncluded;
      const pct = limit > 0
        ? ` - ${Math.round((bp.used / limit) * 100)}% del piano`
        : '';
      const current = bp.isCurrent ? ' [in corso]' : '';
      lines.push(`- ${label}: ${fmt(bp.used)} / ${fmt(limit)} conversazioni${pct}${current}`);
    }
  }

  // Metriche di prodotto (ultimo mese)
  lines.push('');
  lines.push('--- METRICHE DI PRODOTTO (ULTIMO MESE) ---');
  lines.push('');
  lines.push(`Contatti raggiunti: ${fmt(usage.contactsContactedMonthly)}`);
  lines.push(`SMS inviati: ${fmt(usage.smsSentMonthly)}`);
  lines.push(`Integrazioni attive: ${fmt(usage.integrationsEnabledCount)}`);
  lines.push(`Automazioni attive: ${fmt(usage.automationsActiveCount)}`);

  // Piano
  lines.push('');
  lines.push('--- PIANO ---');
  lines.push('');
  if (usage.currentPlan) lines.push(`Piano: ${usage.currentPlan}`);
  if (usage.billing) lines.push(`Fatturazione: ${usage.billing}`);

  return lines.join('\n');
}

export const POST = withAuth(async (request: NextRequest) => {
  try {
    const body = await request.json() as { clientId?: string };
    if (!body.clientId) throw new ApiError(400, 'Missing clientId');

    const clientRes = await pgQuery<{
      name: string;
      hubspot_id: string;
      cs_owner_id: string | null;
    }>('SELECT name, hubspot_id, cs_owner_id FROM clients WHERE id = $1', [body.clientId]);
    if (clientRes.rows.length === 0) throw new ApiError(404, 'Client not found');
    const client = clientRes.rows[0];

    const csOwnerName = getOwnerName(client.cs_owner_id);
    const owner = client.cs_owner_id ? HUBSPOT_OWNERS[client.cs_owner_id] : null;
    const bookingUrl = owner?.bookingUrl || null;

    const [introContent, usage] = await Promise.all([
      generateQbrIntro(client.name, csOwnerName),
      fetchQbrUsageData(client.hubspot_id),
    ]);

    logger.info(`QBR generated for ${client.name} (Metabase account: ${usage.accountId ?? 'not found'})`);

    const slides = [
      {
        title: `QBR - ${client.name}`,
        content: introContent,
        type: 'intro',
      },
      {
        title: 'Il tuo utilizzo di Spoki',
        content: buildUsageSlideContent(usage, client.name),
        type: 'metrics',
      },
      {
        title: 'Novita Spoki',
        content: 'Le ultime release e miglioramenti della piattaforma saranno disponibili a breve.\n\nResta aggiornato: il tuo Customer Success Manager ti comunichera le novita piu rilevanti per il tuo business.',
        type: 'engagement',
      },
      {
        title: 'Parliamone insieme',
        content: bookingUrl
          ? `Prenota una call con ${csOwnerName} per approfondire i dati, discutere i prossimi passi e ottimizzare il tuo utilizzo di Spoki.\n\nPrenota qui: ${bookingUrl}`
          : `Vuoi approfondire i dati o discutere i prossimi passi?\n\nRispondi a questa email o contatta ${csOwnerName} per fissare una call.`,
        type: 'closing',
      },
    ];

    return createSuccessResponse({ data: slides });
  } catch (error) {
    return createErrorResponse(error, 'Failed to generate QBR');
  }
});
