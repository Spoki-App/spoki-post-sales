import { NextRequest } from 'next/server';
import { withAuth, createSuccessResponse, createErrorResponse, ApiError } from '@/lib/api/middleware';
import { pgQuery } from '@/lib/db/postgres';
import { generateQbrIntro, generateQbrReleaseSlide } from '@/lib/services/gemini';
import { HUBSPOT_OWNERS, getOwnerName } from '@/lib/config/owners';
import { fetchQbrUsageData } from '@/lib/services/qbr-metabase';
import { fetchReleaseSpaceDigestForQbr, isGoogleChatReleasesConfigured } from '@/lib/services/google-chat-releases';
import { getLogger } from '@/lib/logger';

const logger = getLogger('api:generate-qbr');

type QbrLang = 'it' | 'en' | 'es';

const L = {
  it: {
    locale: 'it-IT',
    noUsage: (n: string) => `Non sono disponibili dati di utilizzo per ${n} in questo momento.\n\nContattaci per maggiori informazioni sul tuo account.`,
    summary3m: '--- RIEPILOGO ULTIMI 3 MESI ---',
    totalMessages: 'Messaggi totali scambiati',
    ratioLabel: (r: string, out: string, inc: string) => `Rapporto outbound/inbound: ${r}:1 (${out} inviati, ${inc} ricevuti)`,
    billingPeriods: 'Conversazioni per periodo di fatturazione:',
    conversations: 'conversazioni',
    ofPlan: 'del piano',
    current: '[in corso]',
    productMetrics: '--- METRICHE DI PRODOTTO (ULTIMO MESE) ---',
    contactsReached: 'Contatti raggiunti',
    smsSent: 'SMS inviati',
    integrations: 'Integrazioni attive',
    automations: 'Automazioni attive',
    planSection: '--- PIANO ---',
    planLabel: 'Piano',
    billingLabel: 'Fatturazione',
    usageTitle: 'Il tuo utilizzo di Spoki',
    releaseTitle: 'Novita Spoki',
    closingTitle: 'Parliamone insieme',
    closingWithUrl: (owner: string, url: string) => `Prenota una call con ${owner} per approfondire i dati, discutere i prossimi passi e ottimizzare il tuo utilizzo di Spoki.\n\nPrenota qui: ${url}`,
    closingNoUrl: (owner: string) => `Vuoi approfondire i dati o discutere i prossimi passi?\n\nRispondi a questa email o contatta ${owner} per fissare una call.`,
    releaseFallbackAi: 'Le ultime novita della piattaforma non sono disponibili al momento.\n\nIl tuo consulente Spoki ti aggiornera sulle novita piu rilevanti per il tuo business.',
    releaseFallbackEmpty: 'Nessuna novita di rilievo nel periodo coperto da questa QBR.\n\nIl tuo consulente Spoki ti aggiornera appena saranno disponibili nuove funzionalita.',
    releaseFallbackNoCfg: 'Le ultime release e miglioramenti della piattaforma saranno disponibili a breve.\n\nResta aggiornato: il tuo Customer Success Manager ti comunichera le novita piu rilevanti per il tuo business.',
    investmentSection: '--- INVESTIMENTO ---',
    mrrLabel: 'MRR',
    mrrUp: '↑ in crescita',
    mrrDown: '↓ in calo',
    mrrStable: '→ stabile',
    totalInvestment: (total: string) => `Investimento totale nel trimestre: ${total}`,
    investmentBreakdown: (sub: string, recharge: string) => `  di cui abbonamento: ${sub} | ricariche: ${recharge}`,
  },
  en: {
    locale: 'en-US',
    noUsage: (n: string) => `No usage data is available for ${n} at this time.\n\nContact us for more information about your account.`,
    summary3m: '--- LAST 3 MONTHS SUMMARY ---',
    totalMessages: 'Total messages exchanged',
    ratioLabel: (r: string, out: string, inc: string) => `Outbound/inbound ratio: ${r}:1 (${out} sent, ${inc} received)`,
    billingPeriods: 'Conversations per billing period:',
    conversations: 'conversations',
    ofPlan: 'of plan',
    current: '[current]',
    productMetrics: '--- PRODUCT METRICS (LAST MONTH) ---',
    contactsReached: 'Contacts reached',
    smsSent: 'SMS sent',
    integrations: 'Active integrations',
    automations: 'Active automations',
    planSection: '--- PLAN ---',
    planLabel: 'Plan',
    billingLabel: 'Billing',
    usageTitle: 'Your Spoki usage',
    releaseTitle: 'Spoki updates',
    closingTitle: "Let's talk",
    closingWithUrl: (owner: string, url: string) => `Book a call with ${owner} to discuss your data, next steps, and how to get the most out of Spoki.\n\nBook here: ${url}`,
    closingNoUrl: (owner: string) => `Want to discuss the data or plan next steps?\n\nReply to this email or contact ${owner} to schedule a call.`,
    releaseFallbackAi: 'The latest platform updates are not available at this time.\n\nYour Spoki consultant will keep you updated on the most relevant improvements for your business.',
    releaseFallbackEmpty: 'No major updates during the period covered by this QBR.\n\nYour Spoki consultant will notify you as soon as new features are available.',
    releaseFallbackNoCfg: 'The latest releases and platform improvements will be available soon.\n\nStay tuned: your Customer Success Manager will share the most relevant updates for your business.',
    investmentSection: '--- INVESTMENT ---',
    mrrLabel: 'MRR',
    mrrUp: '↑ growing',
    mrrDown: '↓ declining',
    mrrStable: '→ stable',
    totalInvestment: (total: string) => `Total quarterly investment: ${total}`,
    investmentBreakdown: (sub: string, recharge: string) => `  of which subscription: ${sub} | top-ups: ${recharge}`,
  },
  es: {
    locale: 'es-ES',
    noUsage: (n: string) => `No hay datos de uso disponibles para ${n} en este momento.\n\nContactanos para mas informacion sobre tu cuenta.`,
    summary3m: '--- RESUMEN ULTIMOS 3 MESES ---',
    totalMessages: 'Mensajes totales intercambiados',
    ratioLabel: (r: string, out: string, inc: string) => `Relacion outbound/inbound: ${r}:1 (${out} enviados, ${inc} recibidos)`,
    billingPeriods: 'Conversaciones por periodo de facturacion:',
    conversations: 'conversaciones',
    ofPlan: 'del plan',
    current: '[en curso]',
    productMetrics: '--- METRICAS DE PRODUCTO (ULTIMO MES) ---',
    contactsReached: 'Contactos alcanzados',
    smsSent: 'SMS enviados',
    integrations: 'Integraciones activas',
    automations: 'Automatizaciones activas',
    planSection: '--- PLAN ---',
    planLabel: 'Plan',
    billingLabel: 'Facturacion',
    usageTitle: 'Tu uso de Spoki',
    releaseTitle: 'Novedades Spoki',
    closingTitle: 'Hablemos',
    closingWithUrl: (owner: string, url: string) => `Reserva una llamada con ${owner} para profundizar en los datos, discutir los proximos pasos y optimizar tu uso de Spoki.\n\nReserva aqui: ${url}`,
    closingNoUrl: (owner: string) => `Quieres profundizar en los datos o planificar los proximos pasos?\n\nResponde a este correo o contacta a ${owner} para agendar una llamada.`,
    releaseFallbackAi: 'Las ultimas novedades de la plataforma no estan disponibles en este momento.\n\nTu consultor Spoki te mantendra informado sobre las mejoras mas relevantes para tu negocio.',
    releaseFallbackEmpty: 'No hay novedades destacadas en el periodo cubierto por esta QBR.\n\nTu consultor Spoki te avisara cuando haya nuevas funcionalidades disponibles.',
    releaseFallbackNoCfg: 'Las ultimas versiones y mejoras de la plataforma estaran disponibles pronto.\n\nMantente al dia: tu Customer Success Manager te comunicara las novedades mas relevantes para tu negocio.',
    investmentSection: '--- INVERSION ---',
    mrrLabel: 'MRR',
    mrrUp: '↑ en crecimiento',
    mrrDown: '↓ en descenso',
    mrrStable: '→ estable',
    totalInvestment: (total: string) => `Inversion total en el trimestre: ${total}`,
    investmentBreakdown: (sub: string, recharge: string) => `  de los cuales suscripcion: ${sub} | recargas: ${recharge}`,
  },
} as const;

function fmt(n: number, locale = 'it-IT'): string {
  return n.toLocaleString(locale);
}

function buildUsageSlideContent(
  usage: Awaited<ReturnType<typeof fetchQbrUsageData>>,
  clientName: string,
  lang: QbrLang = 'it',
): string {
  const t = L[lang];
  if (!usage.accountId) return t.noUsage(clientName);

  const lines: string[] = [];

  lines.push(t.summary3m);
  lines.push('');

  if (usage.totalMessages3m > 0) {
    lines.push(`${t.totalMessages}: ${fmt(usage.totalMessages3m, t.locale)}`);
    if (usage.messagesOutbound > 0 && usage.messagesInbound > 0) {
      const ratio = (usage.messagesOutbound / usage.messagesInbound).toFixed(1);
      lines.push(t.ratioLabel(ratio, fmt(usage.messagesOutbound, t.locale), fmt(usage.messagesInbound, t.locale)));
    }
  }

  if (usage.billingPeriods.length > 0) {
    lines.push('');
    lines.push(t.billingPeriods);
    for (const bp of usage.billingPeriods) {
      const fmtDate = (d: string) => d.split('-').reverse().join('/');
      const label = `${fmtDate(bp.periodStart)} - ${fmtDate(bp.periodEnd)}`;
      const limit = bp.conversationsIncluded;
      const pct = limit > 0
        ? ` - ${Math.round((bp.used / limit) * 100)}% ${t.ofPlan}`
        : '';
      const cur = bp.isCurrent ? ` ${t.current}` : '';
      lines.push(`- ${label}: ${fmt(bp.used, t.locale)} / ${fmt(limit, t.locale)} ${t.conversations}${pct}${cur}`);
    }
  }

  lines.push('');
  lines.push(t.productMetrics);
  lines.push('');
  lines.push(`${t.contactsReached}: ${fmt(usage.contactsContactedMonthly, t.locale)}`);
  lines.push(`${t.smsSent}: ${fmt(usage.smsSentMonthly, t.locale)}`);
  lines.push(`${t.integrations}: ${fmt(usage.integrationsEnabledCount, t.locale)}`);
  lines.push(`${t.automations}: ${fmt(usage.automationsActiveCount, t.locale)}`);

  lines.push('');
  lines.push(t.planSection);
  lines.push('');
  if (usage.currentPlan) lines.push(`${t.planLabel}: ${usage.currentPlan}`);
  if (usage.billing) lines.push(`${t.billingLabel}: ${usage.billing}`);

  const totalInvestment = usage.subscriptionTotal + usage.rechargeTotal;
  const hasMrr = usage.currentMrr !== null && usage.currentMrr > 0;
  const hasInvestment = totalInvestment > 0;

  if (hasMrr || hasInvestment) {
    lines.push('');
    lines.push(t.investmentSection);
    lines.push('');

    if (hasMrr) {
      const trendLabel = usage.mrrTrend === 'up' ? t.mrrUp
        : usage.mrrTrend === 'down' ? t.mrrDown
        : t.mrrStable;
      lines.push(`${t.mrrLabel}: €${fmt(usage.currentMrr!, t.locale)} ${trendLabel}`);
    }

    if (hasInvestment) {
      lines.push(t.totalInvestment(`€${fmt(totalInvestment, t.locale)}`));
      if (usage.rechargeTotal > 0) {
        lines.push(t.investmentBreakdown(
          `€${fmt(usage.subscriptionTotal, t.locale)}`,
          `€${fmt(usage.rechargeTotal, t.locale)}`,
        ));
      }
    }
  }

  return lines.join('\n');
}

export const POST = withAuth(async (request: NextRequest) => {
  try {
    const body = await request.json() as { clientId?: string; language?: string };
    if (!body.clientId) throw new ApiError(400, 'Missing clientId');

    const lang: QbrLang = (['it', 'en', 'es'] as const).includes(body.language as QbrLang)
      ? (body.language as QbrLang)
      : 'it';
    const t = L[lang];

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

    const since = new Date();
    since.setDate(since.getDate() - 90);

    const chatConfigured = isGoogleChatReleasesConfigured();

    const [introContent, usage, releaseDigest] = await Promise.all([
      generateQbrIntro(client.name, csOwnerName, lang),
      fetchQbrUsageData(client.hubspot_id),
      chatConfigured ? fetchReleaseSpaceDigestForQbr(since) : Promise.resolve(''),
    ]);

    let releaseSlideContent: string;
    if (releaseDigest) {
      try {
        releaseSlideContent = await generateQbrReleaseSlide(releaseDigest, lang);
      } catch (e) {
        logger.warn('Failed to generate release slide via AI, using fallback', { error: String(e) });
        releaseSlideContent = t.releaseFallbackAi;
      }
    } else {
      releaseSlideContent = chatConfigured ? t.releaseFallbackEmpty : t.releaseFallbackNoCfg;
    }

    logger.info(`QBR generated for ${client.name} (lang: ${lang}, Metabase account: ${usage.accountId ?? 'not found'}, releases: ${releaseDigest ? 'yes' : 'no'})`);

    const slides = [
      {
        title: `QBR - ${client.name}`,
        content: introContent,
        type: 'intro',
      },
      {
        title: t.usageTitle,
        content: buildUsageSlideContent(usage, client.name, lang),
        type: 'metrics',
      },
      {
        title: t.releaseTitle,
        content: releaseSlideContent,
        type: 'engagement',
      },
      {
        title: t.closingTitle,
        content: bookingUrl
          ? t.closingWithUrl(csOwnerName, bookingUrl)
          : t.closingNoUrl(csOwnerName),
        type: 'closing',
      },
    ];

    return createSuccessResponse({ data: slides });
  } catch (error) {
    return createErrorResponse(error, 'Failed to generate QBR');
  }
});
