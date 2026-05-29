/**
 * Default templates di prompt + checkpoint per l'analisi delle call.
 * Vengono usati come seed iniziale in DB tramite prompt-registry.ts e
 * come fallback se la tabella prompt_templates risulta inaccessibile.
 *
 * I prompt supportano due placeholder che il registry sostituisce dinamicamente
 * a partire dalla lista di checkpoint configurata:
 *   - {{checkpoints_json_skeleton}}  ->  blocco JSON di output atteso
 *   - {{checkpoints_list}}           ->  lista numerata "key: descrizione"
 */

export type CallType = 'activation' | 'training';

export interface CheckpointDef {
  key: string;
  label: string;
  description: string;
}

export interface PromptDefaults {
  version: string;
  systemPrompt: string;
  checkpoints: CheckpointDef[];
}

const ACTIVATION_SYSTEM_PROMPT = `Analizza la trascrizione di una chiamata di attivazione Spoki (piattaforma WhatsApp Business).

Per ciascun checkpoint, valuta:
- passed (true/false): se il checkpoint e' stato chiaramente completato durante la chiamata
- evidence: una citazione testuale BREVE (max ~200 caratteri) presa LETTERALMENTE dal transcript che giustifica la valutazione, oppure null se non c'e' nessuna evidenza nel transcript
- confidence: "high" se l'evidenza nel transcript e' esplicita e diretta, "medium" se e' implicita ma ragionevole, "low" se l'evidenza e' debole o ambigua

Rispondi SOLO con un oggetto JSON con questa struttura esatta:

{{checkpoints_json_skeleton}}

Checkpoint:
{{checkpoints_list}}

Importante:
- Le citazioni devono essere COPIE LETTERALI dal transcript, NON parafrasi
- Se passed e' false, prova comunque a riportare l'evidenza piu' rilevante che ti ha portato a quella conclusione, oppure null
- Solo JSON, nessun altro testo, nessun commento markdown.`;

const TRAINING_SYSTEM_PROMPT = `Analizza la trascrizione di una chiamata di training Spoki (piattaforma WhatsApp Business).

Per ciascun checkpoint, valuta:
- passed (true/false): se il checkpoint e' stato chiaramente soddisfatto durante la chiamata
- evidence: una citazione testuale BREVE (max ~200 caratteri) presa LETTERALMENTE dal transcript che giustifica la valutazione, oppure null se non c'e' nessuna evidenza nel transcript
- confidence: "high" se l'evidenza nel transcript e' esplicita e diretta, "medium" se e' implicita ma ragionevole, "low" se l'evidenza e' debole o ambigua

Rispondi SOLO con un oggetto JSON con questa struttura esatta:

{{checkpoints_json_skeleton}}

Checkpoint:
{{checkpoints_list}}

Importante:
- Le citazioni devono essere COPIE LETTERALI dal transcript, NON parafrasi
- Se passed e' false, prova comunque a riportare l'evidenza piu' rilevante che ti ha portato a quella conclusione, oppure null
- Solo JSON, nessun altro testo, nessun commento markdown.`;

function labelsOf(checkpoints: CheckpointDef[]): Record<string, string> {
  return Object.fromEntries(checkpoints.map(c => [c.key, c.label]));
}

export const PROMPT_DEFAULTS: Record<CallType, PromptDefaults> = {
  activation: {
    version: 'activation-v2',
    systemPrompt: ACTIVATION_SYSTEM_PROMPT,
    checkpoints: [
      { key: 'metaBusinessManager', label: 'Configurazione Meta Business Manager', description: 'configurata o discussa attivazione Meta Business Manager' },
      { key: 'numberTested', label: 'Test numero attivato (invio e ricezione)', description: 'testato il numero WhatsApp (invio E ricezione)' },
      { key: 'optInAutomation', label: 'Creazione automazione opt-in su Spoki', description: 'creata automazione opt-in su Spoki' },
      { key: 'discoveryDone', label: 'Discovery e personalizzazione', description: 'eseguita discovery del business e personalizzazione' },
      { key: 'smsExplained', label: 'Spiegazione funzionalita SMS', description: 'spiegata la funzionalita SMS' },
      { key: 'nextMeetingBooked', label: 'Programmato incontro successivo', description: 'programmato un incontro successivo' },
      { key: 'followUpEmailMentioned', label: 'Comunicata email follow-up con questionario', description: 'comunicata email follow-up con questionario' },
    ],
  },
  training: {
    version: 'training-v2',
    systemPrompt: TRAINING_SYSTEM_PROMPT,
    checkpoints: [
      { key: 'screen_sharing', label: "Il trainer ha condiviso schermo e mostrato almeno 3 sezioni", description: "il trainer ha condiviso schermo e mostrato almeno 3 sezioni della piattaforma (dashboard, template, automazioni, campagne, contatti, chat, form, pulsanti chat, ecc.)" },
      { key: 'automation_types', label: "Sono stati discussi/mostrati diversi tipi di automazioni", description: "sono stati mostrati o discussi diversi TIPI di automazioni" },
      { key: 'collaborative_work', label: "Trainer e cliente hanno lavorato insieme sulle automazioni", description: "trainer e cliente hanno lavorato INSIEME sulle automazioni (non solo demo)" },
      { key: 'client_objectives', label: "Il consulente ha chiesto e identificato gli obiettivi del cliente", description: "il trainer ha chiesto e identificato gli obiettivi specifici del cliente" },
      { key: 'followup_planned', label: "E' stata pianificata una chiamata di follow-up", description: "e' stata pianificata e concordata una chiamata di follow-up" },
      { key: 'seasonal_features', label: "Sono state mostrate funzionalita per eventi specifici (Pasqua, Natale, saldi)", description: "sono state mostrate o menzionate funzionalita per eventi specifici (Pasqua, Natale, saldi, ecc.)" },
    ],
  },
};

// Pure label maps esportati per la UI (non tirano dentro dipendenze server).
export const ACTIVATION_CHECKPOINT_LABELS = labelsOf(PROMPT_DEFAULTS.activation.checkpoints);
export const TRAINING_CHECKPOINT_LABELS = labelsOf(PROMPT_DEFAULTS.training.checkpoints);

/**
 * Compone il system prompt finale sostituendo i placeholder con il contenuto
 * generato dalla lista di checkpoint configurata. Mantiene la compatibilita'
 * con i prompt che NON usano placeholder (vengono restituiti invariati).
 */
export function renderSystemPrompt(systemPrompt: string, checkpoints: CheckpointDef[]): string {
  if (!systemPrompt.includes('{{')) return systemPrompt;

  const skeleton = buildJsonSkeleton(checkpoints);
  const list = buildCheckpointsList(checkpoints);

  return systemPrompt
    .replace(/\{\{checkpoints_json_skeleton\}\}/g, skeleton)
    .replace(/\{\{checkpoints_list\}\}/g, list);
}

function buildJsonSkeleton(checkpoints: CheckpointDef[]): string {
  if (checkpoints.length === 0) return '{}';
  const longest = Math.max(...checkpoints.map(c => c.key.length));
  const lines = checkpoints.map((c, i) => {
    const padding = ' '.repeat(longest - c.key.length);
    const comma = i < checkpoints.length - 1 ? ',' : '';
    return `  "${c.key}":${padding} {"passed": true/false, "evidence": "..." | null, "confidence": "low|medium|high"}${comma}`;
  });
  return `{\n${lines.join('\n')}\n}`;
}

function buildCheckpointsList(checkpoints: CheckpointDef[]): string {
  return checkpoints.map((c, i) => `${i + 1}. ${c.key}: ${c.description}`).join('\n');
}
