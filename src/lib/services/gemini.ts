import { GoogleGenerativeAI } from '@google/generative-ai';
import Anthropic from '@anthropic-ai/sdk';
import { getLogger } from '@/lib/logger';

const logger = getLogger('services:ai');

type AiProvider = 'claude' | 'gemini';

const AI_PROVIDER: AiProvider =
  (process.env.AI_PROVIDER as AiProvider) || 'claude';

const GEMINI_API_KEY = process.env.GOOGLE_AI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514';

const MAX_RETRIES = 3;

let geminiInstance: GoogleGenerativeAI | null = null;

function getGeminiClient(): GoogleGenerativeAI {
  if (!geminiInstance) {
    if (!GEMINI_API_KEY) throw new Error('GOOGLE_AI_API_KEY is not set');
    geminiInstance = new GoogleGenerativeAI(GEMINI_API_KEY);
  }
  return geminiInstance;
}

async function generateWithGemini(
  prompt: string,
  options?: { temperature?: number; maxOutputTokens?: number },
): Promise<string> {
  const model = getGeminiClient().getGenerativeModel({ model: GEMINI_MODEL });

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: options?.temperature ?? 0.7,
          maxOutputTokens: options?.maxOutputTokens ?? 4096,
        },
      });
      const text = result.response.text();
      const reason = result.response.candidates?.[0]?.finishReason;
      if (reason && reason !== 'STOP') {
        logger.warn(`Gemini finish reason: ${reason}`, { length: text.length });
      }
      return text;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('429') || msg.toLowerCase().includes('rate')) {
        const wait = Math.pow(2, attempt) * 2000;
        logger.warn(`Gemini rate limit, retrying in ${wait / 1000}s (attempt ${attempt + 1})`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      throw error;
    }
  }
  throw new Error('Gemini rate limit exceeded after retries');
}

let claudeInstance: Anthropic | null = null;

function getClaudeClient(): Anthropic {
  if (!claudeInstance) {
    if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set');
    claudeInstance = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  }
  return claudeInstance;
}

async function generateWithClaude(
  prompt: string,
  options?: { temperature?: number; maxOutputTokens?: number },
): Promise<string> {
  const client = getClaudeClient();

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const message = await client.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: options?.maxOutputTokens ?? 4096,
        temperature: options?.temperature ?? 0.7,
        messages: [{ role: 'user', content: prompt }],
      });

      const block = message.content[0];
      const text = block.type === 'text' ? block.text : '';
      if (message.stop_reason !== 'end_turn') {
        logger.warn(`Claude stop reason: ${message.stop_reason}`, { length: text.length });
      }
      return text;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('429') || msg.toLowerCase().includes('rate') || msg.toLowerCase().includes('overloaded')) {
        const wait = Math.pow(2, attempt) * 2000;
        logger.warn(`Claude rate limit, retrying in ${wait / 1000}s (attempt ${attempt + 1})`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      throw error;
    }
  }
  throw new Error('Claude rate limit exceeded after retries');
}

async function generate(
  prompt: string,
  options?: { temperature?: number; maxOutputTokens?: number },
): Promise<string> {
  if (AI_PROVIDER === 'gemini') {
    return generateWithGemini(prompt, options);
  }
  if (!ANTHROPIC_API_KEY) {
    throw new Error(
      'AI: default Claude — imposta ANTHROPIC_API_KEY in .env oppure usa AI_PROVIDER=gemini con GOOGLE_AI_API_KEY'
    );
  }
  return generateWithClaude(prompt, options);
}

/**
 * Lightweight Gemini call that forces a JSON response (used by goal extraction).
 * Kept separate from `generate()` because it sets `responseMimeType: 'application/json'`
 * which the dispatcher path does not.
 */
export async function generateJson(prompt: string): Promise<string> {
  const model = getGeminiClient().getGenerativeModel({
    model: GEMINI_MODEL,
    generationConfig: { responseMimeType: 'application/json' },
  });

  logger.info('Generating JSON via Gemini', { model: GEMINI_MODEL, promptLen: prompt.length });
  const result = await model.generateContent(prompt);
  const text = result.response.text();
  logger.info('Gemini response received', { responseLen: text.length });
  return text;
}

export interface ClientAnalysis {
  summary: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  strengths: string[];
  concerns: string[];
  actions: Array<{ title: string; priority: 'alta' | 'media' | 'bassa'; description: string }>;
}

export async function chat(
  message: string,
  context: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }> = [],
): Promise<string> {
  const historyText = history.length > 0
    ? history.map(h => `${h.role === 'user' ? 'UTENTE' : 'ASSISTENTE'}: ${h.content}`).join('\n')
    : '';

  const prompt = `Sei un assistente Customer Success per Spoki. Rispondi in italiano, in modo conciso e professionale.
Hai accesso ai dati dei clienti del reparto post-sales.

CONTESTO DATI:
${context}

${historyText ? `CONVERSAZIONE PRECEDENTE:\n${historyText}\n` : ''}
DOMANDA DELL'UTENTE:
${message}

Rispondi in modo diretto e utile. Se i dati non sono sufficienti per rispondere, dillo chiaramente.`;

  return generate(prompt, { temperature: 0.5, maxOutputTokens: 2048 });
}

export type EmailType = 'follow_up' | 'renewal' | 'onboarding' | 'reactivation' | 'custom';

export interface GeneratedEmail {
  subject: string;
  body: string;
}

export async function generateEmail(params: {
  type: EmailType;
  clientName: string;
  contactName: string | null;
  plan: string | null;
  renewalDate: string | null;
  onboardingStage: string | null;
  lastEngagementType: string | null;
  lastEngagementDaysAgo: number | null;
  customInstructions?: string;
  senderName: string;
}): Promise<GeneratedEmail> {
  const typeLabels: Record<EmailType, string> = {
    follow_up: 'Follow-up dopo un periodo di silenzio',
    renewal: 'Promemoria rinnovo contratto',
    onboarding: 'Supporto onboarding / training',
    reactivation: 'Riattivazione cliente inattivo',
    custom: 'Email personalizzata',
  };

  const prompt = `Sei un Customer Success Manager di Spoki. Scrivi un'email professionale in italiano per un cliente.

TIPO EMAIL: ${typeLabels[params.type]}
${params.customInstructions ? `ISTRUZIONI AGGIUNTIVE: ${params.customInstructions}` : ''}

DATI CLIENTE:
- Azienda: ${params.clientName}
- Referente: ${params.contactName ?? 'non specificato'}
- Piano: ${params.plan ?? 'non specificato'}
- Rinnovo: ${params.renewalDate ?? 'non specificato'}
- Onboarding: ${params.onboardingStage ?? 'N/D'}
- Ultimo contatto: ${params.lastEngagementType ? `${params.lastEngagementType} (${params.lastEngagementDaysAgo} giorni fa)` : 'nessun contatto recente'}

MITTENTE: ${params.senderName}

Rispondi SOLO con un JSON valido (senza markdown, senza backtick):
{"subject": "oggetto email", "body": "corpo email con \\n per gli a capo"}

L'email deve essere concisa, professionale, cordiale. Usa il "tu" con il referente. Includi una call-to-action chiara. Firma come ${params.senderName}, Spoki.`;

  logger.info(`Generating ${params.type} email for: ${params.clientName}`);
  const text = await generate(prompt, { temperature: 0.6 });

  try {
    return parseJsonResponse<GeneratedEmail>(text);
  } catch {
    logger.error('Failed to parse email response', { text: text.substring(0, 200) });
    return { subject: '', body: text };
  }
}

export interface QbrSlide {
  title: string;
  content: string;
  type: 'intro' | 'metrics' | 'engagement' | 'issues' | 'onboarding' | 'actions' | 'closing';
}

const LANG_NAMES: Record<string, { full: string; intro: string; role: string }> = {
  it: { full: 'ITALIANO', intro: 'Scrivi un testo introduttivo per una Quarterly Business Review (QBR) da inviare al cliente', role: 'il vostro consulente Spoki' },
  en: { full: 'ENGLISH', intro: 'Write an introductory text for a Quarterly Business Review (QBR) to send to the client', role: 'your Spoki consultant' },
  es: { full: 'ESPANOL', intro: 'Escribe un texto introductorio para una Quarterly Business Review (QBR) para enviar al cliente', role: 'su consultor Spoki' },
};

export async function generateQbrIntro(clientName: string, csOwner: string | null, lang: string = 'it'): Promise<string> {
  const ownerName = csOwner && csOwner !== '—' ? csOwner : null;
  const ln = LANG_NAMES[lang] ?? LANG_NAMES.it;

  const prompt = `${ln.intro} "${clientName}".

${ownerName ? `The consultant writing and signing is: ${ownerName}. Their role is "${ln.role}", NEVER "Customer Success Manager".` : ''}

STYLE EXAMPLE (adapt to the client and consultant, DO NOT copy it verbatim):
"Dear [company name],
I am [consultant name], ${ln.role}. With this Quarterly Business Review I would like to review our journey and collaboration over the past months, focusing on the most recent and significant activities. The goal is to provide you with a clear overview of what we have achieved together, highlighting progress and areas of support.
Our partnership is fundamental and we are here to ensure you get the most value from the Spoki platform."

RULES:
- Tone: professional, friendly, collaborative, partnership-oriented.
- The consultant introduces themselves by name and role ("${ln.role}").
- Mention that the QBR contains platform usage data and updates.
- Close with a message emphasizing the value of the collaboration.
- Max 500 characters.
- Write in ${ln.full}.
- No markdown. Plain text only.
- Do NOT include specific dates or periods (they will be added automatically).
- Reply ONLY with the text, no JSON, no quotes.`;

  logger.info(`Generating QBR intro for: ${clientName} (lang: ${lang})`);
  return generate(prompt, { temperature: 0.4, maxOutputTokens: 1024 });
}

export async function generateQbrReleaseSlide(releaseDigest: string, lang: string = 'it'): Promise<string> {
  const ln = LANG_NAMES[lang] ?? LANG_NAMES.it;

  const prompt = `You are a Customer Success Manager at Spoki. Write the content of a QBR slide about platform updates, aimed at the CLIENT.

You have the following raw messages from the internal "release" space (one line per message, format: date author | text). Use ONLY this data to list the updates; do not invent anything.

RELEASE MESSAGES:
${releaseDigest}

RULES:
- Select 5-7 of the MOST RECENT and relevant updates for a client using Spoki (WhatsApp Business).
- Prioritize releases from the last 4-6 weeks over older ones.
- Cover diverse categories (e.g. chat, automations, integrations, analytics, billing) -- do not focus on a single topic.
- Each bullet MUST start with the date in square brackets, format [DD/MM]. Example: [03/04] New feature X.
- Each update must be a bullet point (line starting with "- ") with a short, clear sentence in client-friendly language (not internal/technical).
- If a message is about internal fixes, infrastructure, tests, or details not visible to the client, skip it.
- Order from most recent to least recent.
- Max 600 characters total.
- Write in ${ln.full}.
- No markdown (no **, #, _). Plain text only with dash bullets.
- Reply ONLY with the bullet text, no JSON, no quotes, no headings.`;

  logger.info(`Generating QBR release slide from digest (lang: ${lang})`);
  const text = await generate(prompt, { temperature: 0.5, maxOutputTokens: 1024 });
  return stripQbrMarkdown(text.trim());
}

function stripQbrMarkdown(s: string): string {
  return s.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/__([^_]+)__/g, '$1');
}

export async function generateQbr(params: {
  clientName: string;
  csOwner: string | null;
  engagementTimelineText: string;
  emailCount: number;
  meetingCount: number;
  periodCovered: string;
  playbookContext?: string;
  releaseDigestFromChat?: string;
}): Promise<QbrSlide[]> {
  const ownerLine = params.csOwner ? `Referente Spoki che firma il discorso: ${params.csOwner}.` : '';

  const playbookBlock = params.playbookContext
    ? `
CONTESTO PLAYBOOK (note interne Spoki: obiettivi cliente, stato onboarding, use case concordati, sentiment, handoff sales→CS).
Queste note vengono da log automatici delle call di onboarding/training/followup. Usa queste informazioni per arricchire la QBR con i fatti concordati col cliente (obiettivi, use case, stato avanzamento), ma NON citare queste note come fonte al cliente (sono interne). Riformula in linguaggio rivolto al cliente.
${params.playbookContext}
`
    : '';

  const playbookInstructions = params.playbookContext
    ? `- Usa il CONTESTO PLAYBOOK per ancorare la QBR agli obiettivi reali del cliente. In slide 2 o 5 cita gli obiettivi concordati e lo stato di avanzamento (es. "ci eravamo posti l'obiettivo di X, e abbiamo Y"). Se ci sono use case definiti, menzionali come "percorso concordato" senza dire "dal playbook". Non riprodurre il testo grezzo delle note; sintetizza in modo professionale.
`
    : '';

  const releaseBlock = params.releaseDigestFromChat
    ? `

SECONDA FONTE (solo novita prodotto / release interne Spoki):
Messaggi dallo space Google Chat "release" del periodo (testo grezzo, una riga per messaggio). Usa SOLO questo blocco per citare release o miglioramenti prodotto; non inventare versioni o date non presenti qui.
${params.releaseDigestFromChat}
`
    : '';

  const releaseInstructions = params.releaseDigestFromChat
    ? `- Se il blocco GOOGLE CHAT sopra non e vuoto: in slide 2 (percorso) o slide 5 (valore) aggiungi al massimo 2-3 bullet in linguaggio cliente sulle release o miglioramenti prodotto rilevanti per chi usa Spoki, citando solo quanto presente in quel blocco. Se nulla e rilevante per il cliente, ometti.
`
    : '';

  const prompt = `Sei un Customer Success Manager. Devi scrivere una QBR (Quarterly Business Review) in ITALIANO da mostrare o condividere con il CLIENTE (${params.clientName}).

Scopo: far capire al cliente, in modo chiaro e professionale, cosa abbiamo fatto INSIEME nel periodo - come "in questi mesi abbiamo fatto xyz". Deve essere utile e concreta, non generica.

${ownerLine}

FONTI DI VERITA:
- Principale: EMAIL (incluse INCOMING_EMAIL) e MEETING elencati sotto, in ordine cronologico dal piu vecchio al piu recente.
- ${params.playbookContext ? 'Contesto Playbook: note interne con obiettivi cliente, use case, stato onboarding, sentiment (vedi blocco dedicato).' : 'Nessun playbook presente per questo cliente.'}
- ${params.releaseDigestFromChat ? 'Aggiuntiva: blocco Google Chat release (solo per novita prodotto).' : 'Nessun blocco Google Chat configurato per questa generazione.'}
- Non citare chiamate telefoniche (CALL), ticket, piano, MRR, rinnovo, metriche interne se non compaiono nelle fonti.

Conteggio nel campione: ${params.emailCount} email, ${params.meetingCount} meeting. Periodo coperto dai dati: ${params.periodCovered}.

ELENCO EMAIL E MEETING (cita date, oggetti email, titoli meeting e temi emersi solo da qui):
${params.engagementTimelineText}
${playbookBlock}${releaseBlock}

Regole di contenuto:
- Ogni frase deve poter essere ricondotta all'elenco. Se qualcosa non compare, non inventarlo.
- VIETATO: ipotesi o riempitivi tipo "probabilmente", "forse", "potrebbe essere stato", "e stato probabilmente", "sembra che", "presumibilmente". Scrivi solo cio che le righe dell'elenco supportano; se il dettaglio non c'e, di' che il meeting ha avuto luogo in quella data e cita TITOLO o oggetto email, senza inventare l'agenda.
- Nella slide sui meeting: per ogni riga che inizia con una data e contiene MEETING, usa come nome dell'incontro il testo dopo "TITOLO_PER_QBR:". Vietato dire che il titolo "non e valorizzato" o "non risulta nei sistemi" se TITOLO_PER_QBR contiene gia un nome (es. Follow Up, Onboarding | Activation Call, testo prima del link Meet). Usa quella stringa come titolo della bullet. Solo se TITOLO_PER_QBR e esattamente "Meeting senza titolo ne descrizione in HubSpot" puoi dire che mancano dettagli in CRM.
- Tono: rispettoso, positivo dove i fatti lo consentono, trasparente dove ci sono stati problemi o richieste (es. recesso, urgenze) se emergono dalle email.
- Raggruppa per filoni/temi quando ha senso, ma resta ancorato a fatti e date.
- Se l'elenco e vuoto o e solo il messaggio che mancano sync: 2 slide oneste (intro + cosa serve per avere la QBR) senza inventare attivita.
${playbookInstructions}${releaseInstructions}
Struttura ESATTAMENTE 6 slide (type come indicato):
1. type intro - Saluto al cliente, cos'e questa QBR, periodo ${params.periodCovered}, tono collaborativo.
2. type engagement - Sintesi narrativa "il nostro percorso": cosa e successo nel tempo usando solo email e meeting (fasi o temi principali).
3. type engagement - Focus sui MEETING: elenco concreti con data e titolo/tema; cosa si e lavorato insieme nelle call.
4. type engagement - Focus sulle EMAIL: filoni ricorrenti (es. supporto, contratto, operativita), con esempi concreti di oggetto o tema e periodo.
5. type actions - Valore della collaborazione e cosa emerge dal lavoro svolto (solo dai dati); eventuali prossimi passi SOLO se ricavabili dalle ultime comunicazioni, altrimenti invito a definirli insieme.
6. type closing - Ringraziamento, sintesi in 2-3 bullet, invito al dialogo per il prossimo periodo.

Output: SOLO JSON valido (no markdown, no backtick):
[
  {"title": "...", "content": "testo con \\n e righe che iniziano con - ", "type": "intro|engagement|actions|closing"}
]

Vincoli formato:
- Vietato markdown: niente **, niente #, niente _corsivo_. Solo testo piano; per enfasi usa maiuscole iniziali o trattini a elenco.
- Ogni "content" MASSIMO 600 caratteri, frasi brevi. Se il testo rischia di superare, sintetizza.
- JSON completo con ] finale. NON troncare mai il JSON: e meglio accorciare il testo che produrre un output incompleto.`;

  logger.info(`Generating QBR for: ${params.clientName}`);
  const text = await generate(prompt, { temperature: 0.35, maxOutputTokens: 16384 });

  try {
    const slides = parseJsonResponse<QbrSlide[]>(text);
    return slides.map((s) => ({
      ...s,
      title: stripQbrMarkdown(s.title),
      content: stripQbrMarkdown(s.content),
    }));
  } catch {
    const preview = text.length > 1200 ? `${text.slice(0, 1200)}…` : text;
    logger.error('Failed to parse QBR response', { text: text.substring(0, 400), length: text.length });
    return [{
      title: 'Risposta incompleta o non valida',
      content:
        'Il modello ha restituito un JSON troncato o non parsabile (spesso per troppo testo nelle slide). '
        + 'Riprova a generare; se succede di nuovo, segnala al team.\n\n'
        + `Anteprima tecnica (${text.length} caratteri):\n${preview}`,
      type: 'intro',
    }];
  }
}

export interface PortfolioInsights {
  overview: string;
  riskDistribution: { low: number; medium: number; high: number; critical: number };
  topRisks: Array<{ client: string; reason: string }>;
  topOpportunities: Array<{ client: string; reason: string }>;
  recommendations: string[];
}

function parseJsonResponse<T>(text: string): T {
  let cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const firstBrace = cleaned.indexOf('{');
  const firstBracket = cleaned.indexOf('[');
  const start = firstBrace >= 0 && (firstBracket < 0 || firstBrace < firstBracket) ? firstBrace : firstBracket;
  if (start > 0) cleaned = cleaned.substring(start);
  const lastBrace = cleaned.lastIndexOf('}');
  const lastBracket = cleaned.lastIndexOf(']');
  const end = lastBrace > lastBracket ? lastBrace : lastBracket;
  if (end >= 0 && end < cleaned.length - 1) cleaned = cleaned.substring(0, end + 1);
  return JSON.parse(cleaned) as T;
}

export async function analyzePortfolio(params: {
  totalClients: number;
  totalMrr: number;
  renewingNext30: Array<{ name: string; plan: string | null; mrr: number | null; renewalDate: string }>;
  noContactLast30: Array<{ name: string; plan: string | null }>;
  openSupportTickets: number;
  avgDaysInPipeline: number | null;
  onboardingBreakdown: Record<string, number>;
}): Promise<PortfolioInsights> {
  const prompt = `Sei un VP Customer Success. Analizza il portfolio clienti e fornisci insight strategici in italiano.

DATI PORTFOLIO:
- Clienti totali: ${params.totalClients}
- MRR totale: ${params.totalMrr} EUR
- Ticket supporto aperti: ${params.openSupportTickets}
- Giorni medi in pipeline: ${params.avgDaysInPipeline ?? 'N/D'}

RINNOVI NEI PROSSIMI 30 GIORNI (${params.renewingNext30.length}):
${params.renewingNext30.map(c => `- ${c.name} | piano: ${c.plan ?? 'N/D'} | MRR: ${c.mrr ?? 'N/D'} EUR | rinnovo: ${c.renewalDate}`).join('\n')}

CLIENTI SENZA CONTATTO DA 30+ GIORNI (${params.noContactLast30.length}):
${params.noContactLast30.map(c => `- ${c.name} | piano: ${c.plan ?? 'N/D'}`).join('\n')}

DISTRIBUZIONE ONBOARDING:
${Object.entries(params.onboardingBreakdown).map(([stage, count]) => `- ${stage}: ${count}`).join('\n')}

Rispondi SOLO con un JSON valido (senza markdown, senza backtick):
{
  "overview": "panoramica di 3-4 frasi sulla salute del portfolio",
  "riskDistribution": {"low": N, "medium": N, "high": N, "critical": N},
  "topRisks": [{"client": "nome", "reason": "motivo rischio"}],
  "topOpportunities": [{"client": "nome", "reason": "opportunita"}],
  "recommendations": ["raccomandazione strategica 1", "raccomandazione 2", "raccomandazione 3"]
}

Stima la distribuzione rischio basandoti sui dati. Identifica max 5 rischi e 3 opportunita.`;

  logger.info('Analyzing portfolio');
  const text = await generate(prompt, { temperature: 0.4, maxOutputTokens: 4096 });

  try {
    return parseJsonResponse<PortfolioInsights>(text);
  } catch {
    logger.error('Failed to parse portfolio response', { text: text.substring(0, 200) });
    return {
      overview: text.substring(0, 500),
      riskDistribution: { low: 0, medium: 0, high: 0, critical: 0 },
      topRisks: [],
      topOpportunities: [],
      recommendations: [],
    };
  }
}

export interface IndustryWaStrategy {
  title: string;
  objective: string;
  tactics: string[];
  exampleTemplate: string;
  kpis: string[];
  complianceNote: string;
}

export interface IndustryWaStrategiesResult {
  executiveSummary: string;
  strategies: IndustryWaStrategy[];
}

export async function generateIndustryWhatsAppStrategies(params: {
  industryLabel: string;
  clientCount: number | null;
  industryHubspotKey: string | null;
}): Promise<IndustryWaStrategiesResult> {
  const keyLine =
    params.industryHubspotKey && params.industryHubspotKey !== '__unclassified__'
      ? `Valore tecnico industry (HubSpot industry_spoki): ${params.industryHubspotKey}.`
      : '';

  const countLine =
    params.clientCount != null && params.clientCount >= 0
      ? `Clienti nel segmento nel portafoglio considerato: ${params.clientCount}.`
      : 'Numero clienti nel segmento: non indicato.';

  const prompt = `Sei un esperto di marketing conversazionale su WhatsApp Business (API ufficiale Meta) e di automazioni per il mercato italiano ed europeo.

Contesto: i destinatari delle strategie sono team Customer Success / Growth che usano **Spoki** (piattaforma per WhatsApp Business, inbox, automazioni, integrazioni CRM).

VERTICAL / SEGMENTO (da usare come focus principale):
"${params.industryLabel}"
${keyLine}
${countLine}

Genera **4–6 strategie** distinte (acquisizione lead, nurturing, retention, upsell/cross-sell, riattivazione, eventi/stagionalità del vertical, ecc.) **specifiche per questo vertical** e per canale WhatsApp.

Per ogni strategia sii concreto: segmentazione, tipo di messaggio, momenti del customer journey, uso di template vs sessioni a 24h dove rilevante.

Rispondi **SOLO** con un JSON valido (nessun markdown, nessun testo fuori dal JSON):
{
  "executiveSummary": "2–4 frasi in italiano che sintetizzano l'approccio consigliato per questo vertical su WhatsApp",
  "strategies": [
    {
      "title": "titolo breve e azionabile",
      "objective": "obiettivo misurabile in una frase",
      "tactics": ["tattica 1", "tattica 2", "tattica 3"],
      "exampleTemplate": "Esempio di messaggio o outline di flusso WhatsApp (italiano, professionale, <= 900 caratteri; puoi usare \\n per a capo)",
      "kpis": ["KPI 1", "KPI 2"],
      "complianceNote": "Breve promemoria su opt-in, template Meta, frequenza, dati personali (GDPR) in italiano"
    }
  ]
}`;

  logger.info('Generating industry WhatsApp strategies', {
    industry: params.industryLabel,
    clientCount: params.clientCount,
  });
  const text = await generate(prompt, { temperature: 0.65, maxOutputTokens: 6144 });

  try {
    return parseJsonResponse<IndustryWaStrategiesResult>(text);
  } catch {
    logger.error('Failed to parse industry WA strategies', { text: text.substring(0, 300) });
    return {
      executiveSummary: 'Impossibile strutturare la risposta del modello. Ecco il testo grezzo da riutilizzare manualmente:',
      strategies: [
        {
          title: 'Output non strutturato',
          objective: 'Rileggi e adatta i contenuti al tuo vertical.',
          tactics: ['Copia i punti utili dal testo sotto'],
          exampleTemplate: text.slice(0, 3500),
          kpis: [],
          complianceNote:
            'Verifica sempre opt-in, policy Meta WhatsApp e privacy prima di inviare campagne.',
        },
      ],
    };
  }
}

export async function analyzeClient(context: {
  name: string;
  plan: string | null;
  mrr: number | null;
  renewalDate: string | null;
  daysInPipeline: number | null;
  onboardingStage: string | null;
  openSupportTickets: number;
  lastEngagement: { type: string; daysAgo: number } | null;
  totalEngagements: number;
  contactsCount: number;
}): Promise<ClientAnalysis> {
  const prompt = `Sei un Customer Success Manager esperto. Analizza la situazione di questo cliente e fornisci un'analisi strutturata in italiano.

DATI CLIENTE:
- Nome: ${context.name}
- Piano: ${context.plan ?? 'non specificato'}
- MRR: ${context.mrr ? `${context.mrr} EUR` : 'non specificato'}
- Data rinnovo: ${context.renewalDate ?? 'non specificata'}
- Giorni dall'attivazione: ${context.daysInPipeline ?? 'N/D'}
- Stage onboarding: ${context.onboardingStage ?? 'N/D'}
- Ticket supporto aperti: ${context.openSupportTickets}
- Ultimo engagement: ${context.lastEngagement ? `${context.lastEngagement.type} (${context.lastEngagement.daysAgo} giorni fa)` : 'nessuno'}
- Engagement totali: ${context.totalEngagements}
- Contatti associati: ${context.contactsCount}

Rispondi SOLO con un JSON valido (senza markdown, senza backtick) con questa struttura:
{
  "summary": "riassunto di 2-3 frasi sulla situazione del cliente",
  "riskLevel": "low|medium|high|critical",
  "strengths": ["punto di forza 1", "punto di forza 2"],
  "concerns": ["preoccupazione 1", "preoccupazione 2"],
  "actions": [
    {"title": "azione 1", "priority": "alta|media|bassa", "description": "descrizione dettagliata"}
  ]
}`;

  logger.info(`Analyzing client: ${context.name}`);
  const text = await generate(prompt, { temperature: 0.4 });

  try {
    return parseJsonResponse<ClientAnalysis>(text);
  } catch {
    logger.error('Failed to parse AI response as JSON', { text: text.substring(0, 200) });
    return {
      summary: text.substring(0, 500),
      riskLevel: 'medium',
      strengths: [],
      concerns: [],
      actions: [],
    };
  }
}
