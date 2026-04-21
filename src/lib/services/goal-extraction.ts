import { pgQuery } from '@/lib/db/postgres';
import { generateJson } from './gemini';
import { getLogger } from '@/lib/logger';

const logger = getLogger('services:goal-extraction');

export type GoalExtractionResult = {
  inserted: number;
  engagementRows: number;
  contextLines: number;
  /** Codice breve per messaggi in UI */
  hint?: 'no_engagements' | 'ai_empty';
};

function parseAiJsonArray(raw: string): ExtractedGoal[] {
  let s = raw.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) s = fence[1].trim();
  try {
    const p = JSON.parse(s);
    return Array.isArray(p) ? (p as ExtractedGoal[]) : [];
  } catch {
    const start = s.indexOf('[');
    const end = s.lastIndexOf(']');
    if (start >= 0 && end > start) {
      try {
        const p = JSON.parse(s.slice(start, end + 1));
        return Array.isArray(p) ? (p as ExtractedGoal[]) : [];
      } catch {
        return [];
      }
    }
    return [];
  }
}

function safeMentionedDate(value: string | null | undefined): string | null {
  if (!value || typeof value !== 'string') return null;
  const d = value.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  return d;
}

type GoalCategory =
  | 'automation'
  | 'marketing'
  | 'sales'
  | 'customer_service'
  | 'integration'
  | 'analytics'
  | 'other';

const GOAL_CATEGORIES: ReadonlySet<GoalCategory> = new Set([
  'automation', 'marketing', 'sales', 'customer_service', 'integration', 'analytics', 'other',
]);

interface ExtractedGoal {
  title: string;
  description: string;
  category: GoalCategory | null;
  mentionedAt: string | null;
  dueDate: string | null;
  fromPlaybook: boolean;
  engagementIndex: number | null;
}

interface EngagementRow {
  id: string;
  type: string;
  occurred_at: string;
  title: string | null;
  raw_properties: unknown;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseRawProperties(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw || '{}') as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return {};
}

function strProp(raw: Record<string, unknown>, key: string): string {
  const v = raw[key];
  return typeof v === 'string' ? v : '';
}

/** Testo utile per l’AI: deriva da raw_properties HubSpot (sync), non da una tabella separata. */
function engagementTextContent(type: string, title: string | null, raw: unknown): string {
  const r = parseRawProperties(raw);
  const t = type.toUpperCase();

  if (t === 'NOTE') {
    return stripHtml(strProp(r, 'hs_note_body') || strProp(r, 'hs_body_preview')) || title || '';
  }
  if (t === 'EMAIL' || t === 'INCOMING_EMAIL') {
    return stripHtml(strProp(r, 'hs_email_text')) || title || '';
  }
  if (t === 'CALL') {
    const parts = [title, stripHtml(strProp(r, 'hs_call_body'))].filter(Boolean);
    return parts.join('\n');
  }
  if (t === 'MEETING') {
    const parts = [
      title,
      stripHtml(strProp(r, 'hs_meeting_body')),
      stripHtml(strProp(r, 'hs_internal_meeting_notes')),
    ].filter(Boolean);
    return parts.join('\n');
  }
  if (t === 'TASK') {
    const subj = strProp(r, 'hs_task_subject');
    return [subj, title].filter(Boolean).join(' — ') || title || '';
  }
  return title || '';
}

export async function extractGoalsForClient(clientId: string): Promise<GoalExtractionResult> {
  const existingGoalsRes = await pgQuery<{ id: string; title: string; source: string }>(
    `SELECT id, title, source FROM client_goals WHERE client_id = $1`,
    [clientId]
  );
  const manualGoals = existingGoalsRes.rows.filter(g => g.source === 'manual');
  const aiGoalIds = existingGoalsRes.rows.filter(g => g.source !== 'manual').map(g => g.id);

  // Pull a wider candidate set, deduped, then rank: engagements with substantive text
  // (note bodies, email text, meeting/call notes) come first, calendar invites and
  // empty bodies last. Meetings/notes outrank calls; recency breaks ties.
  const engRes = await pgQuery<EngagementRow>(
    `WITH cand AS (
       SELECT DISTINCT ON (e.id) e.id, e.type, e.occurred_at, e.title, e.raw_properties
       FROM engagements e
       LEFT JOIN contacts co ON e.contact_id = co.id
       WHERE e.client_id = $1::uuid
          OR co.client_id = $1::uuid
          OR EXISTS (
            SELECT 1 FROM clients c
            WHERE c.id = $1::uuid
              AND NULLIF(BTRIM(c.hubspot_id::text), '') IS NOT NULL
              AND NULLIF(BTRIM(e.company_hubspot_id::text), '') IS NOT NULL
              AND BTRIM(e.company_hubspot_id::text) = BTRIM(c.hubspot_id::text)
          )
     )
     SELECT id, type, occurred_at, title, raw_properties
     FROM cand
     ORDER BY
       (length(COALESCE(
          raw_properties->>'hs_note_body',
          raw_properties->>'hs_email_text',
          raw_properties->>'hs_meeting_body',
          raw_properties->>'hs_call_body',
          raw_properties->>'hs_body_preview',
          ''
        )) > 80) DESC,
       CASE type WHEN 'NOTE' THEN 1 WHEN 'MEETING' THEN 2 WHEN 'EMAIL' THEN 3 WHEN 'INCOMING_EMAIL' THEN 3 ELSE 4 END,
       occurred_at DESC
     LIMIT 80`,
    [clientId]
  );

  const engagements = engRes.rows;
  if (engagements.length === 0) {
    logger.info('No engagements found for client', { clientId });
    return { inserted: 0, engagementRows: 0, contextLines: 0, hint: 'no_engagements' };
  }

  const playbooks: string[] = [];
  const otherEngagements: string[] = [];

  // HubSpot calendar-invite boilerplate that Meeting bodies often contain: it adds no
  // semantic value for goal extraction but pads the prompt with noise.
  const CAL_INVITE_NOISE_RE = /(devi apportare modifiche|ripianifica|annulla|reschedule|cancel meeting)/i;
  const MIN_USEFUL_LEN = 40;

  engagements.forEach((e, i) => {
    const date = new Date(e.occurred_at).toISOString().slice(0, 10);
    const body = engagementTextContent(e.type, e.title, e.raw_properties).trim();
    const title = e.title?.trim() || '';

    let content = body || title;
    if (!content) return;

    if (e.type === 'MEETING' && body && CAL_INVITE_NOISE_RE.test(body) && body.length < 600) {
      content = title;
    }
    if (content.length < MIN_USEFUL_LEN && content === title) return;

    const hasStructuredFields = content.includes('##') || content.includes('**') || content.length > 500;

    if (e.type === 'NOTE' && hasStructuredFields) {
      playbooks.push(`[PLAYBOOK ${i}] Date: ${date}\n${content.slice(0, 3000)}`);
    } else {
      const typeLabel = e.type === 'CALL' ? 'Call' : e.type === 'EMAIL' ? 'Email' : e.type === 'MEETING' ? 'Meeting' : e.type;
      otherEngagements.push(`[${typeLabel} ${i}] Date: ${date}\n${content.slice(0, 1500)}`);
    }
  });

  const contextLines = playbooks.length + otherEngagements.length;
  if (contextLines === 0) {
    logger.info('No usable engagement content for client after filtering', { clientId, engagementRows: engagements.length });
    return { inserted: 0, engagementRows: engagements.length, contextLines: 0, hint: 'ai_empty' };
  }

  const manualGoalsList = manualGoals.length > 0
    ? manualGoals.map(g => `- "${g.title}"`).join('\n')
    : '(none)';

  const maxNewGoals = Math.max(0, 5 - manualGoals.length);

  const today = new Date().toISOString().slice(0, 10);
  const prompt = `Sei un Customer Success analyst di Spoki (piattaforma WhatsApp Business per marketing, vendita, automazione e customer care). Analizza gli engagement con un cliente e estrai gli OBIETTIVI DI BUSINESS che il cliente vuole raggiungere usando Spoki.

DEFINIZIONE DI OBIETTIVO (cosa estrarre)
Un obiettivo descrive UN RISULTATO che il cliente vuole ottenere per il suo business attraverso Spoki. Deve essere un caso d'uso concreto, non un'attivita' di setup tecnico.

ESEMPI di OBIETTIVI VALIDI da estrarre:
- "Avere un'automazione che risponda ai clienti negli orari non lavorativi"
- "Recuperare i carrelli abbandonati con un flusso WhatsApp automatico"
- "Inviare promemoria appuntamenti via WhatsApp per ridurre i no-show"
- "Lanciare una campagna broadcast mensile sui nuovi prodotti"
- "Gestire le richieste di assistenza in chat con un bot di primo livello"
- "Qualificare i lead da Meta Ads via WhatsApp prima di passarli al sales"
- "Raccogliere feedback post-acquisto via WhatsApp"
- "Integrare WhatsApp con il CRM per tracciare le conversazioni"

NON ESTRARRE (sono attivita' di setup, non obiettivi):
- "Procurarsi un numero di telefono" / "scegliere il numero da collegare"
- "Avere un Meta Business Manager funzionante" / "verificare il dominio"
- "Prenotare la chiamata di attivazione" / "completare l'onboarding"
- "Pagare il piano" / "firmare il contratto"
- Frasi generiche tipo "migliorare la customer experience" senza un caso d'uso concreto.
- Problemi tecnici o ticket di supporto.

=== STRUCTURED PLAYBOOK NOTES ===
${playbooks.length > 0 ? playbooks.join('\n\n---\n\n') : '(none)'}

=== OTHER ENGAGEMENTS (calls, emails, meetings) ===
${otherEngagements.length > 0 ? otherEngagements.join('\n\n---\n\n') : '(none)'}

=== OBIETTIVI MANUALI ESISTENTI (NON duplicarli) ===
${manualGoalsList}

CATEGORIE valide (scegline UNA per ogni obiettivo):
- "automation": flussi automatici, chatbot, risposte automatiche, trigger
- "marketing": campagne broadcast, promozioni, newsletter, lead gen
- "sales": qualificazione lead, conversione, recupero carrelli, upsell
- "customer_service": assistenza clienti, ticketing, FAQ in chat
- "integration": collegamenti CRM/e-commerce/Meta Ads/altri sistemi
- "analytics": reportistica, metriche, tracciamento conversioni
- "other": tutto il resto che e' un obiettivo di business ma non rientra sopra

Rispondi SOLO con JSON valido (no markdown, no backtick):
[
  {
    "title": "titolo breve dell'obiettivo (max 80 caratteri, in italiano)",
    "description": "1-2 frasi che spiegano il caso d'uso e il contesto in cui e' emerso",
    "category": "automation|marketing|sales|customer_service|integration|analytics|other",
    "mentionedAt": "YYYY-MM-DD oppure null",
    "dueDate": "YYYY-MM-DD oppure null",
    "fromPlaybook": true|false,
    "engagementIndex": N oppure null
  }
]

REGOLE:
- Estrai al massimo ${maxNewGoals} obiettivi. Se non ci sono obiettivi di business validi, restituisci [].
- Ogni obiettivo deve essere chiaramente distinto. Niente duplicati o rifrasare.
- NON duplicare gli obiettivi manuali esistenti elencati sopra.
- "mentionedAt" = data (YYYY-MM-DD) della prima volta che l'obiettivo emerge negli engagement. Se non chiara, null.
- "dueDate" = scadenza/deadline esplicita menzionata dal cliente o concordata (es. "entro fine mese", "per il Black Friday"). Se nessuna scadenza e' menzionata, null. Calcola la data assoluta partendo da oggi (${today}) quando il testo usa riferimenti relativi (es. "entro 2 settimane" -> aggiungi 14 giorni a oggi).
- "category" e' obbligatoria. Scegli quella piu' rappresentativa tra le 7 sopra.
- "fromPlaybook" = true solo se l'obiettivo viene da una nota playbook strutturata.
- "engagementIndex" = numero indice dall'etichetta dell'engagement (es. da "[Call 5]" -> 5). Null se incerto.
- Tutto il testo (title, description) DEVE essere in italiano.`;

  const rawJson = await generateJson(prompt);

  let parsed = parseAiJsonArray(rawJson);
  if (parsed.length === 0 && rawJson.trim().length > 0) {
    logger.warn('AI returned no parseable goals', { rawJson: rawJson.slice(0, 400) });
  }
  parsed = parsed.slice(0, maxNewGoals);

  if (aiGoalIds.length > 0) {
    await pgQuery(
      `DELETE FROM client_goals WHERE id = ANY($1::uuid[])`,
      [aiGoalIds]
    );
    logger.info('Removed old AI goals before re-extraction', { clientId, removed: aiGoalIds.length });
  }

  let inserted = 0;
  for (const goal of parsed) {
    if (!goal?.title || typeof goal.title !== 'string') continue;

    let engIdx: number | null = null;
    const rawIdx = goal.engagementIndex;
    if (rawIdx !== null && rawIdx !== undefined) {
      const n = typeof rawIdx === 'number' ? rawIdx : parseInt(String(rawIdx), 10);
      if (!Number.isNaN(n) && n >= 0 && n < engagements.length) engIdx = n;
    }

    const engagementId = engIdx !== null ? engagements[engIdx].id : null;

    const rawPb: unknown = (goal as { fromPlaybook?: unknown }).fromPlaybook;
    const fromPb = rawPb === true || rawPb === 'true';
    const source = fromPb ? 'playbook' : 'ai_extracted';
    const mentionedAt = safeMentionedDate(
      typeof goal.mentionedAt === 'string' ? goal.mentionedAt : goal.mentionedAt != null ? String(goal.mentionedAt) : null
    );
    const dueDate = safeMentionedDate(
      typeof goal.dueDate === 'string' ? goal.dueDate : goal.dueDate != null ? String(goal.dueDate) : null
    );
    const rawCat = (goal as { category?: unknown }).category;
    const category: GoalCategory | null =
      typeof rawCat === 'string' && GOAL_CATEGORIES.has(rawCat as GoalCategory)
        ? (rawCat as GoalCategory)
        : null;

    const res = await pgQuery<{ id: string }>(
      `INSERT INTO client_goals (client_id, title, description, status, source, source_engagement_id, mentioned_at, due_date, category, created_by)
       VALUES ($1, $2, $3, 'active', $4, $5, $6, $7, $8, 'ai')
       ON CONFLICT (client_id, title) DO UPDATE SET
         description = EXCLUDED.description,
         source = EXCLUDED.source,
         source_engagement_id = EXCLUDED.source_engagement_id,
         mentioned_at = EXCLUDED.mentioned_at,
         due_date = EXCLUDED.due_date,
         category = EXCLUDED.category
       RETURNING id`,
      [clientId, goal.title.slice(0, 200), goal.description || null, source, engagementId, mentionedAt, dueDate, category]
    );
    if (res.rows.length > 0) inserted++;
  }

  logger.info('Goals extracted and inserted', {
    clientId,
    total: parsed.length,
    inserted,
    engagementRows: engagements.length,
    contextLines,
  });

  return {
    inserted,
    engagementRows: engagements.length,
    contextLines,
    hint: inserted === 0 ? 'ai_empty' : undefined,
  };
}
