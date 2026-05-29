import { pgQuery } from '@/lib/db/postgres';
import { getLogger } from '@/lib/logger';
import { generateText, parseAiJsonResponse } from '@/lib/services/gemini';
import { buildAccountBriefContext, type AccountBriefContext } from '@/lib/account-brief/build-context';
import { CS_PIPELINE_STAGES, type CsPipelineStageId } from '@/lib/config/cs-pipeline';

const logger = getLogger('services:touchpoint-questions');

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TouchpointTemplate {
  id: string;
  touchpointType: string;
  version: string;
  label: string;
  description: string | null;
  systemPrompt: string;
  isActive: boolean;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TouchpointTypeSummary {
  type: string;
  label: string;
  description: string | null;
  hasActiveTemplate: boolean;
  isSeed: boolean;
}

export interface TouchpointQuestionsOutput {
  objective: string;
  talkingPoints: string[];
  openingQuestions: string[];
  discoveryQuestions: string[];
  challengeQuestions: string[];
  closingQuestions: string[];
  redFlags: string[];
}

export interface TouchpointDefault {
  label: string;
  description: string;
  version: string;
  systemPrompt: string;
}

// ─── Default prompt template (shared) ─────────────────────────────────────────

/**
 * Lo stesso scheletro di system prompt e' riusato da tutti i tipi seed; il
 * focus specifico di ciascun tipo viene iniettato come blocco "FOCUS DELLA CALL".
 * Questo riduce duplicazione e garantisce un output JSON consistente.
 */
function buildDefaultSystemPrompt(focus: string): string {
  return `Sei un Customer Success Manager senior di Spoki (piattaforma WhatsApp Business).
Devi preparare il CSM a una call con un cliente generando domande mirate e talking point.

FOCUS DELLA CALL:
${focus}

CONTESTO DEL CLIENTE (JSON con dati reali estratti da HubSpot e dalla piattaforma Spoki):
{{client_context_json}}

CONTESTO AGGIUNTIVO FORNITO DAL CSM (puo' essere vuoto):
{{additional_context}}

ISTRUZIONI:
- Tutte le domande devono essere PERSONALIZZATE sul contesto reale del cliente: cita esplicitamente fatti/numeri presenti nel JSON (es. ticket aperti, MRR, stage onboarding, NPS, feature non utilizzate, ultimi engagement, goal dichiarati).
- Vietato inventare informazioni non presenti nel contesto.
- Le domande devono essere APERTE (non si/no), per fare emergere aspettative, scogli e opportunita'.
- Tono professionale, empatico, concreto. Italiano. "tu" o "voi" come appropriato.
- Se un campo del contesto e' null/vuoto, evita di basarci una domanda; preferisci aree con dati reali.

Rispondi SOLO con un JSON valido (senza markdown, senza backtick) con questa struttura ESATTA:
{
  "objective": "obiettivo principale della call in 1 frase",
  "talkingPoints": ["3-5 punti chiave da toccare, ancorati al contesto"],
  "openingQuestions": ["3-4 domande per aprire la call e capire come sta il cliente"],
  "discoveryQuestions": ["4-6 domande per capire aspettative, bisogni, priorita'"],
  "challengeQuestions": ["3-5 domande per far emergere preoccupazioni, scogli, blocchi"],
  "closingQuestions": ["2-3 domande per consolidare next step e ottenere commitment"],
  "redFlags": ["2-4 segnali a cui prestare attenzione durante la call, basati sui dati reali"]
}

Ogni domanda deve essere autonoma e direttamente utilizzabile dal CSM senza riformulazione.`;
}

// ─── Defaults dei 6 tipi seed ─────────────────────────────────────────────────

export const TOUCHPOINT_DEFAULTS: Record<string, TouchpointDefault> = {
  onboarding: {
    label: 'Onboarding',
    description: 'Welcome / training / follow-up onboarding: capire aspettative iniziali e sbloccare problemi di attivazione.',
    version: 'onboarding-v1',
    systemPrompt: buildDefaultSystemPrompt(
      `Call di onboarding: il cliente sta entrando nella piattaforma o e' nelle prime fasi di utilizzo. Obiettivi: validare le aspettative iniziali, accompagnare nei primi setup, identificare blocchi tecnici/processuali, far emergere obiettivi a 3-6 mesi e definire il prossimo passo. Cita lo stage onboarding corrente, eventuali ticket di Activation Problems, NPS basato su utilizzo e attivita' di campagne WhatsApp.`,
    ),
  },
  check_in: {
    label: 'Check-in periodico',
    description: 'Follow-up CS periodico (allineato a follow_up_1 / follow_up_2 della pipeline CS) per misurare la salute della relazione.',
    version: 'check-in-v1',
    systemPrompt: buildDefaultSystemPrompt(
      `Call di check-in periodico CS: relazione gia' avviata. Obiettivi: misurare la salute della relazione, scoprire cambiamenti recenti (nuovi obiettivi, riorganizzazioni, nuovi use case), individuare segnali deboli di disengagement, riconfermare il valore percepito e raccogliere feedback. Cita i giorni dall'ultimo contatto, i ticket aperti, l'andamento delle campagne WhatsApp e le feature attive vs inattive.`,
    ),
  },
  strategic: {
    label: 'Call strategica / QBR',
    description: 'Review strategica/QBR: bilancio del periodo, allineamento obiettivi futuri, posizionamento del valore Spoki nella roadmap del cliente.',
    version: 'strategic-v1',
    systemPrompt: buildDefaultSystemPrompt(
      `Call strategica o QBR (Quarterly Business Review): pianificazione di alto livello. Obiettivi: fare il punto sui risultati ottenuti, allineare gli obiettivi del prossimo periodo, presentare opportunita' di evoluzione del piano, posizionare Spoki nella strategia complessiva del cliente. Cita MRR, plan, andamento NPS, durata della collaborazione, goal dichiarati e roadmap percepita.`,
    ),
  },
  upsell: {
    label: 'Upsell / espansione',
    description: 'Proposta di passaggio di piano o aggiunta di moduli: validare bisogno e ROI prima della proposta commerciale.',
    version: 'upsell-v1',
    systemPrompt: buildDefaultSystemPrompt(
      `Call di upsell o espansione: il cliente ha potenziale per un piano superiore o moduli aggiuntivi. Obiettivi: validare il bisogno reale, misurare la disponibilita' a investire, capire i decision maker coinvolti, far emergere il ROI atteso e i rischi percepiti. NON essere aggressivo: fai prima discovery, poi propongono il prossimo passo. Cita le feature MarketingMind attualmente attive e quelle inattive (gap di valore), il volume delle campagne WhatsApp e il piano corrente.`,
    ),
  },
  churn_prevention: {
    label: 'Churn prevention',
    description: 'Cliente a rischio: comprendere i motivi del disengagement e definire un piano di recupero concreto.',
    version: 'churn-prevention-v1',
    systemPrompt: buildDefaultSystemPrompt(
      `Call di prevenzione churn: il cliente ha mostrato segnali di rischio (NPS basso, churn risk HubSpot, ticket aperti high priority, calo engagement, vicinanza al rinnovo). Obiettivi: aprire un dialogo onesto, comprendere le frustrazioni reali (prodotto, pricing, supporto, organizzazione interna), validare se il problema e' di execution o di fit, proporre un piano di recupero concreto e timeboxed. Tono empatico, mai difensivo. Cita NPS basato su utilizzo, churn_risk HubSpot, giorni al rinnovo e ticket high priority aperti.`,
    ),
  },
  renewal: {
    label: 'Rinnovo',
    description: 'Negoziazione/conferma rinnovo contratto: validare il valore percepito e gestire eventuali leve commerciali.',
    version: 'renewal-v1',
    systemPrompt: buildDefaultSystemPrompt(
      `Call di rinnovo: il contratto e' in scadenza. Obiettivi: misurare il valore effettivamente percepito nel periodo passato, validare il commitment a rinnovare, capire se il piano corrente e' ancora il giusto fit (downsell, mantieni, upsell), gestire eventuali obiezioni di prezzo, allineare aspettative per il prossimo periodo. Cita giorni al rinnovo, MRR, plan, andamento campagne, goal raggiunti e non raggiunti.`,
    ),
  },
};

// ─── DB helpers ───────────────────────────────────────────────────────────────

interface DbRow {
  id: string;
  touchpoint_type: string;
  version: string;
  label: string;
  description: string | null;
  system_prompt: string;
  is_active: boolean;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

function rowToTemplate(row: DbRow): TouchpointTemplate {
  return {
    id: row.id,
    touchpointType: row.touchpoint_type,
    version: row.version,
    label: row.label,
    description: row.description,
    systemPrompt: row.system_prompt,
    isActive: row.is_active,
    notes: row.notes,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function seedDefault(type: string): Promise<TouchpointTemplate> {
  const def = TOUCHPOINT_DEFAULTS[type];
  if (!def) throw new Error(`Nessun default registrato per touchpoint_type "${type}"`);
  logger.info('Seeding default touchpoint template', { type, version: def.version });

  const result = await pgQuery<DbRow>(
    `INSERT INTO touchpoint_question_templates
       (touchpoint_type, version, label, description, system_prompt, is_active, notes, created_by)
     VALUES ($1, $2, $3, $4, $5, TRUE, $6, $7)
     ON CONFLICT (touchpoint_type, version) DO UPDATE SET is_active = TRUE
     RETURNING *`,
    [type, def.version, def.label, def.description, def.systemPrompt, 'Default seed da TOUCHPOINT_DEFAULTS', 'system'],
  );
  return rowToTemplate(result.rows[0]);
}

function makeFallbackTemplate(type: string): TouchpointTemplate {
  const def = TOUCHPOINT_DEFAULTS[type];
  if (!def) throw new Error(`Nessun default registrato per touchpoint_type "${type}"`);
  const now = new Date().toISOString();
  return {
    id: `fallback-${type}`,
    touchpointType: type,
    version: def.version,
    label: def.label,
    description: def.description,
    systemPrompt: def.systemPrompt,
    isActive: true,
    notes: 'Fallback in-code (DB non raggiungibile o tabella vuota)',
    createdBy: 'system',
    createdAt: now,
    updatedAt: now,
  };
}

export async function getActiveTemplate(type: string): Promise<TouchpointTemplate> {
  try {
    const result = await pgQuery<DbRow>(
      `SELECT * FROM touchpoint_question_templates WHERE touchpoint_type = $1 AND is_active = TRUE LIMIT 1`,
      [type],
    );
    if (result.rows.length > 0) return rowToTemplate(result.rows[0]);
    if (TOUCHPOINT_DEFAULTS[type]) {
      try {
        return await seedDefault(type);
      } catch (e) {
        logger.warn('Seed fallita, uso fallback in-memory', { type, error: String(e) });
        return makeFallbackTemplate(type);
      }
    }
    throw new Error(`Nessun template attivo per touchpoint_type "${type}" e nessun default registrato`);
  } catch (err) {
    if (TOUCHPOINT_DEFAULTS[type]) {
      logger.error('Errore caricamento template, uso fallback in-memory', { type, error: String(err) });
      return makeFallbackTemplate(type);
    }
    throw err;
  }
}

export async function listTemplatesByType(type: string): Promise<TouchpointTemplate[]> {
  const result = await pgQuery<DbRow>(
    `SELECT * FROM touchpoint_question_templates WHERE touchpoint_type = $1 ORDER BY created_at DESC`,
    [type],
  );
  return result.rows.map(rowToTemplate);
}

export async function getTemplateById(id: string): Promise<TouchpointTemplate | null> {
  const result = await pgQuery<DbRow>(
    `SELECT * FROM touchpoint_question_templates WHERE id = $1 LIMIT 1`,
    [id],
  );
  return result.rows[0] ? rowToTemplate(result.rows[0]) : null;
}

export async function listTouchpointTypes(): Promise<TouchpointTypeSummary[]> {
  let dbTypes: Array<{ type: string; label: string; description: string | null; hasActive: boolean }> = [];
  try {
    const result = await pgQuery<{
      touchpoint_type: string;
      label: string;
      description: string | null;
      has_active: boolean;
    }>(
      `SELECT DISTINCT ON (touchpoint_type)
         touchpoint_type,
         label,
         description,
         BOOL_OR(is_active) OVER (PARTITION BY touchpoint_type) AS has_active
       FROM touchpoint_question_templates
       ORDER BY touchpoint_type, is_active DESC, created_at DESC`,
      [],
    );
    dbTypes = result.rows.map(r => ({
      type: r.touchpoint_type,
      label: r.label,
      description: r.description,
      hasActive: Boolean(r.has_active),
    }));
  } catch (err) {
    logger.warn('Impossibile leggere tipi da DB, uso solo i seed', { error: String(err) });
  }

  const dbMap = new Map(dbTypes.map(t => [t.type, t]));
  const out: TouchpointTypeSummary[] = [];

  for (const [type, def] of Object.entries(TOUCHPOINT_DEFAULTS)) {
    const fromDb = dbMap.get(type);
    out.push({
      type,
      label: fromDb?.label ?? def.label,
      description: fromDb?.description ?? def.description,
      hasActiveTemplate: fromDb?.hasActive ?? false,
      isSeed: true,
    });
    dbMap.delete(type);
  }
  for (const t of dbMap.values()) {
    out.push({
      type: t.type,
      label: t.label,
      description: t.description,
      hasActiveTemplate: t.hasActive,
      isSeed: false,
    });
  }
  return out;
}

// ─── Versioning helpers ──────────────────────────────────────────────────────

function generateVersion(type: string): string {
  const now = new Date();
  const stamp = [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, '0'),
    String(now.getUTCDate()).padStart(2, '0'),
    '-',
    String(now.getUTCHours()).padStart(2, '0'),
    String(now.getUTCMinutes()).padStart(2, '0'),
    String(now.getUTCSeconds()).padStart(2, '0'),
  ].join('');
  return `${type}-${stamp}`;
}

function isValidTypeKey(s: string): boolean {
  return /^[a-z][a-z0-9_]{1,63}$/.test(s);
}

export interface DraftInput {
  systemPrompt: string;
  label?: string;
  description?: string | null;
  notes?: string | null;
}

export async function createDraft(type: string, input: DraftInput, createdBy: string): Promise<TouchpointTemplate> {
  if (!input.systemPrompt || !input.systemPrompt.trim()) throw new Error('systemPrompt non puo essere vuoto');
  if (!isValidTypeKey(type)) throw new Error(`touchpoint_type "${type}" non valido (lowercase, lettere/numeri/underscore)`);

  const existing = await listTemplatesByType(type);
  const labelToUse = input.label?.trim() || existing[0]?.label || TOUCHPOINT_DEFAULTS[type]?.label;
  if (!labelToUse) throw new Error('label richiesto quando si crea il primo template per un nuovo touchpoint_type');
  const descriptionToUse =
    input.description !== undefined ? input.description : existing[0]?.description ?? TOUCHPOINT_DEFAULTS[type]?.description ?? null;

  const version = generateVersion(type);
  const result = await pgQuery<DbRow>(
    `INSERT INTO touchpoint_question_templates
       (touchpoint_type, version, label, description, system_prompt, is_active, notes, created_by)
     VALUES ($1, $2, $3, $4, $5, FALSE, $6, $7)
     RETURNING *`,
    [type, version, labelToUse, descriptionToUse, input.systemPrompt, input.notes ?? null, createdBy],
  );
  return rowToTemplate(result.rows[0]);
}

/**
 * Crea un nuovo touchpoint_type con la sua prima versione, gia' attiva.
 * Usato dall'UI admin per registrare tipi custom oltre ai 6 seed.
 */
export async function createNewType(input: {
  type: string;
  label: string;
  description?: string | null;
  systemPrompt: string;
  createdBy: string;
}): Promise<TouchpointTemplate> {
  if (!isValidTypeKey(input.type)) {
    throw new Error('type non valido: usa lowercase, lettere/numeri/underscore (max 64 char)');
  }
  if (!input.label.trim()) throw new Error('label richiesto');
  if (!input.systemPrompt.trim()) throw new Error('systemPrompt richiesto');

  const existing = await listTemplatesByType(input.type);
  if (existing.length > 0) throw new Error(`touchpoint_type "${input.type}" esiste gia'`);

  const version = generateVersion(input.type);
  const result = await pgQuery<DbRow>(
    `INSERT INTO touchpoint_question_templates
       (touchpoint_type, version, label, description, system_prompt, is_active, notes, created_by)
     VALUES ($1, $2, $3, $4, $5, TRUE, $6, $7)
     RETURNING *`,
    [
      input.type,
      version,
      input.label.trim(),
      input.description?.trim() || null,
      input.systemPrompt,
      'Tipo custom creato da UI',
      input.createdBy,
    ],
  );
  return rowToTemplate(result.rows[0]);
}

export async function activate(id: string): Promise<TouchpointTemplate> {
  const tpl = await getTemplateById(id);
  if (!tpl) throw new Error(`Template non trovato: ${id}`);

  await pgQuery('BEGIN');
  try {
    await pgQuery(
      `UPDATE touchpoint_question_templates SET is_active = FALSE
       WHERE touchpoint_type = $1 AND id <> $2 AND is_active = TRUE`,
      [tpl.touchpointType, id],
    );
    await pgQuery(`UPDATE touchpoint_question_templates SET is_active = TRUE WHERE id = $1`, [id]);
    await pgQuery('COMMIT');
  } catch (e) {
    await pgQuery('ROLLBACK');
    throw e;
  }

  const fresh = await getTemplateById(id);
  if (!fresh) throw new Error('Template scomparso dopo activate');
  return fresh;
}

// ─── Context building ─────────────────────────────────────────────────────────

export interface TouchpointContext {
  brief: AccountBriefContext;
  /** Stage onboarding HubSpot corrente (label gia' leggibile + tipo: normal/problem). */
  onboardingStage: { stage: string | null; type: string | null };
  /** Stage CS pipeline corrente. */
  csPipelineStage: { id: CsPipelineStageId | null; label: string | null };
  recentEngagements: Array<{
    type: string;
    occurredAt: string;
    daysAgo: number;
    title: string | null;
    ownerId: string | null;
  }>;
  goals: Array<{
    title: string;
    description: string | null;
    status: string;
    dueDate: string | null;
    mentionedAt: string | null;
  }>;
  openDeals: Array<{
    pipelineId: string;
    stageId: string;
    name: string | null;
    amount: number | null;
    closeDate: string | null;
  }>;
  daysSinceActivation: number | null;
}

export async function buildTouchpointContext(clientId: string): Promise<TouchpointContext> {
  const brief = await buildAccountBriefContext(clientId);

  const onboardingRes = await pgQuery<{
    onboarding_stage: string | null;
    onboarding_stage_type: string | null;
  }>(
    `SELECT onboarding_stage, onboarding_stage_type FROM clients WHERE id = $1`,
    [clientId],
  );
  const onb = onboardingRes.rows[0];

  const csRes = await pgQuery<{ stage: string | null }>(
    `SELECT stage FROM cs_success_pipeline WHERE client_id = $1 LIMIT 1`,
    [clientId],
  ).catch(() => ({ rows: [] as Array<{ stage: string | null }> }));
  const csStageId = csRes.rows[0]?.stage as CsPipelineStageId | undefined;

  const engRes = await pgQuery<{ type: string; occurred_at: string; title: string | null; owner_id: string | null }>(
    `SELECT e.type, e.occurred_at, e.title, e.owner_id
     FROM engagements e
     LEFT JOIN contacts co ON e.contact_id = co.id
     WHERE (e.client_id = $1 OR co.client_id = $1)
     ORDER BY e.occurred_at DESC
     LIMIT 10`,
    [clientId],
  );
  const now = Date.now();
  const recentEngagements = engRes.rows.map(r => ({
    type: r.type,
    occurredAt: r.occurred_at,
    daysAgo: Math.floor((now - new Date(r.occurred_at).getTime()) / (1000 * 60 * 60 * 24)),
    title: r.title,
    ownerId: r.owner_id,
  }));

  const goalsRes = await pgQuery<{
    title: string;
    description: string | null;
    status: string;
    due_date: string | null;
    mentioned_at: string | null;
  }>(
    `SELECT title, description, status, due_date, mentioned_at
     FROM client_goals
     WHERE client_id = $1
     ORDER BY status, mentioned_at DESC NULLS LAST, created_at DESC
     LIMIT 15`,
    [clientId],
  );
  const goals = goalsRes.rows.map(g => ({
    title: g.title,
    description: g.description,
    status: g.status,
    dueDate: g.due_date,
    mentionedAt: g.mentioned_at,
  }));

  const dealsRes = await pgQuery<{
    pipeline_id: string;
    stage_id: string;
    deal_name: string | null;
    amount: string | null;
    close_date: string | null;
  }>(
    `SELECT pipeline_id, stage_id, deal_name, amount, close_date
     FROM deals
     WHERE client_id = $1
       AND (close_date IS NULL OR close_date >= NOW() - INTERVAL '90 days')
     ORDER BY updated_at DESC
     LIMIT 10`,
    [clientId],
  );
  const openDeals = dealsRes.rows.map(d => ({
    pipelineId: d.pipeline_id,
    stageId: d.stage_id,
    name: d.deal_name,
    amount: d.amount ? parseFloat(d.amount) : null,
    closeDate: d.close_date,
  }));

  // La data di attivazione vive in raw_properties HubSpot (proprietà "activation_call"),
  // non come colonna dedicata: usiamo quella già estratta dal brief.
  const activationDate = brief.activationCallDate;
  const daysSinceActivation = activationDate
    ? Math.floor((now - new Date(activationDate).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  const csStageLabel = csStageId
    ? CS_PIPELINE_STAGES.find(s => s.id === csStageId)?.label ?? null
    : null;

  return {
    brief,
    onboardingStage: {
      stage: onb?.onboarding_stage ?? null,
      type: onb?.onboarding_stage_type ?? null,
    },
    csPipelineStage: { id: csStageId ?? null, label: csStageLabel },
    recentEngagements,
    goals,
    openDeals,
    daysSinceActivation,
  };
}

// ─── Generation ───────────────────────────────────────────────────────────────

function renderPrompt(systemPrompt: string, ctx: TouchpointContext, additional: string | null): string {
  const ctxJson = JSON.stringify(ctx, null, 2);
  const add = additional?.trim() ? additional.trim() : '(nessun contesto aggiuntivo fornito)';
  return systemPrompt
    .replace(/\{\{client_context_json\}\}/g, ctxJson)
    .replace(/\{\{additional_context\}\}/g, add);
}

function emptyOutput(): TouchpointQuestionsOutput {
  return {
    objective: '',
    talkingPoints: [],
    openingQuestions: [],
    discoveryQuestions: [],
    challengeQuestions: [],
    closingQuestions: [],
    redFlags: [],
  };
}

function normalizeOutput(parsed: unknown): TouchpointQuestionsOutput {
  const o = (parsed && typeof parsed === 'object' ? parsed : {}) as Record<string, unknown>;
  const arr = (v: unknown): string[] => (Array.isArray(v) ? v.map(x => String(x)).filter(Boolean) : []);
  return {
    objective: typeof o.objective === 'string' ? o.objective : '',
    talkingPoints: arr(o.talkingPoints),
    openingQuestions: arr(o.openingQuestions),
    discoveryQuestions: arr(o.discoveryQuestions),
    challengeQuestions: arr(o.challengeQuestions),
    closingQuestions: arr(o.closingQuestions),
    redFlags: arr(o.redFlags),
  };
}

export interface GenerateInput {
  clientId: string;
  type: string;
  additionalContext?: string;
}

export interface GenerateResult {
  template: { id: string; type: string; version: string; label: string };
  questions: TouchpointQuestionsOutput;
  generatedAt: string;
}

export async function generateTouchpointQuestions(input: GenerateInput): Promise<GenerateResult> {
  const template = await getActiveTemplate(input.type);
  const ctx = await buildTouchpointContext(input.clientId);
  const prompt = renderPrompt(template.systemPrompt, ctx, input.additionalContext ?? null);

  logger.info('Generating touchpoint questions', {
    clientId: input.clientId,
    type: input.type,
    templateVersion: template.version,
    promptLen: prompt.length,
  });

  const text = await generateText(prompt, { temperature: 0.5, maxOutputTokens: 4096 });

  let questions: TouchpointQuestionsOutput;
  try {
    questions = normalizeOutput(parseAiJsonResponse<unknown>(text));
  } catch (e) {
    logger.error('Failed to parse touchpoint questions response', {
      preview: text.substring(0, 300),
      error: String(e),
    });
    questions = emptyOutput();
    questions.objective = 'Errore nel parsing della risposta AI. Riprova.';
  }

  return {
    template: { id: template.id, type: template.touchpointType, version: template.version, label: template.label },
    questions,
    generatedAt: new Date().toISOString(),
  };
}
