import { config } from '@/lib/config';
import { getLogger } from '@/lib/logger';
import type { AccountBriefContext } from './build-context';

const logger = getLogger('account-brief:generate');

export interface AccountBriefAiSections {
  sintesiCliente: string;
  featureSummary: string;
  ticketSummary: string;
  campagneSummary: string;
  utilizzoPiattaforma: string;
  rischioChurn: string;
  prossimaBestAction: string;
}

export interface GenerateAccountBriefResult {
  sections: AccountBriefAiSections;
  model: string | null;
  fallback: boolean;
}

const FALLBACK_SECTIONS = (ctx: AccountBriefContext): AccountBriefAiSections => ({
  sintesiCliente: [
    ctx.usageBasedNps.summary,
    ctx.activationCallDate ? `Activation call (HubSpot): ${ctx.activationCallDate}.` : 'Data Activation call non presente in sync (verifica nome proprietà activation_call in hubspot-props).',
    `Cliente: ${ctx.clientName}.`,
  ]
    .filter(Boolean)
    .join(' '),
  featureSummary: ctx.marketingMind
    ? `Attive: ${ctx.marketingMind.active.join(', ') || '—'}. Non attive: ${ctx.marketingMind.inactive.join(', ') || '—'}.`
    : 'Feature Marketing Mind / Meta: dati non disponibili (configura MARKETING_MIND_API_URL o il template URL).',
  ticketSummary:
    ctx.openTickets.length === 0
      ? 'Nessun ticket aperto rilevato.'
      : ctx.openTickets
          .slice(0, 8)
          .map(t => `• ${t.subject ?? '(senza oggetto)'} [${t.status ?? '?'}]`)
          .join('\n'),
  campagneSummary:
    ctx.whatsappCampaigns.length === 0
      ? 'Ultime campagne WhatsApp: nessun dato (configura WHATSAPP_CAMPAIGNS_API_URL) o nessuna campagna.'
      : ctx.whatsappCampaigns.map(c => `• ${c.name}${c.sentAt ? ` — ${c.sentAt}` : ''}${c.status ? ` (${c.status})` : ''}`).join('\n'),
  utilizzoPiattaforma: ctx.healthScore
    ? `Health score ${ctx.healthScore.score}/100 (${ctx.healthScore.status}). Onboarding ${ctx.healthScore.onboardingPct}%. Ultimo contatto: ${
        ctx.healthScore.daysSinceLastContact != null ? `${ctx.healthScore.daysSinceLastContact} giorni fa` : 'sconosciuto'
      }. Ticket aperti: ${ctx.healthScore.openTicketsCount} (${ctx.healthScore.openHighTicketsCount} alta priorità).`
    : 'Health score non ancora calcolato per questo cliente.',
  rischioChurn: [
    ctx.churnRiskHubspot ? `HubSpot churn risk: ${ctx.churnRiskHubspot}.` : '',
    ctx.healthScore ? `Stato salute: ${ctx.healthScore.status}.` : '',
  ]
    .filter(Boolean)
    .join(' ') || 'Dati churn insufficienti.',
  prossimaBestAction: ctx.healthScore?.status === 'red'
    ? 'Priorità: contattare il cliente, chiudere o de-escalare i ticket critici e verificare il rinnovo.'
    : ctx.openTickets.length > 3
      ? 'Priorità: fare il punto sui ticket aperti e aspettative.'
      : 'Mantenere il ritmo di contatto e monitorare NPS stimato (utilizzo) e adoption.',
});

export async function generateAccountBriefWithAi(ctx: AccountBriefContext): Promise<GenerateAccountBriefResult> {
  const apiKey = config.accountBrief.openaiApiKey;
  const model = config.accountBrief.openaiModel;

  if (!apiKey) {
    logger.info('OPENAI_API_KEY missing, using rule-based brief');
    return { sections: FALLBACK_SECTIONS(ctx), model: null, fallback: true };
  }

  const system = `Sei un CSM senior Spoki. Ricevi un JSON con fatti su un cliente B2B.
Il campo usageBasedNps è un NPS stimato dall'utilizzo piattaforma (scala −100…+100), NON da survey.
activationCallDate è la data della proprietà HubSpot "Activation call" (attivazione numero).
Rispondi SOLO con un JSON valido UTF-8, senza markdown, con esattamente queste chiavi stringa in italiano:
sintesiCliente, featureSummary, ticketSummary, campagneSummary, utilizzoPiattaforma, rischioChurn, prossimaBestAction.
Sii sintetico (2-4 frasi per campo dove ha senso; ticketSummary e campagneSummary possono usare elenchi puntati).`;

  const user = `Contesto cliente (JSON):\n${JSON.stringify(ctx, null, 2)}`;

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.35,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      logger.warn(`OpenAI error ${res.status}`, { body: errText.slice(0, 500) });
      return { sections: FALLBACK_SECTIONS(ctx), model, fallback: true };
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      return { sections: FALLBACK_SECTIONS(ctx), model, fallback: true };
    }

    const parsed = JSON.parse(content) as Partial<AccountBriefAiSections>;
    const sections: AccountBriefAiSections = {
      sintesiCliente: String(parsed.sintesiCliente ?? FALLBACK_SECTIONS(ctx).sintesiCliente),
      featureSummary: String(parsed.featureSummary ?? FALLBACK_SECTIONS(ctx).featureSummary),
      ticketSummary: String(parsed.ticketSummary ?? FALLBACK_SECTIONS(ctx).ticketSummary),
      campagneSummary: String(parsed.campagneSummary ?? FALLBACK_SECTIONS(ctx).campagneSummary),
      utilizzoPiattaforma: String(parsed.utilizzoPiattaforma ?? FALLBACK_SECTIONS(ctx).utilizzoPiattaforma),
      rischioChurn: String(parsed.rischioChurn ?? FALLBACK_SECTIONS(ctx).rischioChurn),
      prossimaBestAction: String(parsed.prossimaBestAction ?? FALLBACK_SECTIONS(ctx).prossimaBestAction),
    };

    return { sections, model, fallback: false };
  } catch (e) {
    logger.error('OpenAI request failed', e);
    return { sections: FALLBACK_SECTIONS(ctx), model, fallback: true };
  }
}
