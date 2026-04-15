import Anthropic from '@anthropic-ai/sdk';
import { getLogger } from '@/lib/logger';

const logger = getLogger('services:meeting-analysis');

export interface ActivationAnalysis {
  metaBusinessManager: boolean;
  numberTested: boolean;
  optInAutomation: boolean;
  discoveryDone: boolean;
  smsExplained: boolean;
  nextMeetingBooked: boolean;
  followUpEmailMentioned: boolean;
}

export interface TrainingAnalysis {
  screen_sharing: boolean;
  automation_types: boolean;
  collaborative_work: boolean;
  client_objectives: boolean;
  followup_planned: boolean;
  seasonal_features: boolean;
}

export const ACTIVATION_CHECKPOINT_LABELS: Record<keyof ActivationAnalysis, string> = {
  metaBusinessManager: 'Configurazione Meta Business Manager',
  numberTested: 'Test numero attivato (invio e ricezione)',
  optInAutomation: 'Creazione automazione opt-in su Spoki',
  discoveryDone: 'Discovery e personalizzazione',
  smsExplained: 'Spiegazione funzionalita SMS',
  nextMeetingBooked: 'Programmato incontro successivo',
  followUpEmailMentioned: 'Comunicata email follow-up con questionario',
};

export const TRAINING_CHECKPOINT_LABELS: Record<keyof TrainingAnalysis, string> = {
  screen_sharing: "Il trainer ha condiviso schermo e mostrato almeno 3 sezioni",
  automation_types: "Sono stati discussi/mostrati diversi tipi di automazioni", 
  collaborative_work: "Trainer e cliente hanno lavorato insieme sulle automazioni",
  client_objectives: "Il consulente ha chiesto e identificato gli obiettivi del cliente",
  followup_planned: "È stata pianificata una chiamata di follow-up",
  seasonal_features: "Sono state mostrate funzionalità per eventi specifici (Pasqua, Natale, saldi)"
};

// Legacy export for backward compatibility
export const CHECKPOINT_LABELS = ACTIVATION_CHECKPOINT_LABELS;

const ACTIVATION_SYSTEM_PROMPT = `Analizza la trascrizione di una chiamata di attivazione Spoki (piattaforma WhatsApp Business).

Determina se ciascun checkpoint e stato completato. Rispondi SOLO con un oggetto JSON con 7 campi booleani:

{"metaBusinessManager":true/false,"numberTested":true/false,"optInAutomation":true/false,"discoveryDone":true/false,"smsExplained":true/false,"nextMeetingBooked":true/false,"followUpEmailMentioned":true/false}

Checkpoint:
1. metaBusinessManager: configurata attivazione Meta Business Manager
2. numberTested: testato il numero WhatsApp (invio E ricezione)
3. optInAutomation: creata automazione opt-in su Spoki
4. discoveryDone: eseguita discovery e personalizzazione
5. smsExplained: spiegata funzionalita SMS
6. nextMeetingBooked: programmato incontro successivo
7. followUpEmailMentioned: comunicata email follow-up con questionario

Solo JSON, nessun altro testo.`;

const TRAINING_SYSTEM_PROMPT = `Analizza la trascrizione di una chiamata di training Spoki (piattaforma WhatsApp Business).

Determina se ciascun checkpoint e stato completato. Rispondi SOLO con un oggetto JSON con 6 campi booleani:

{"screen_sharing":true/false,"automation_types":true/false,"collaborative_work":true/false,"client_objectives":true/false,"followup_planned":true/false,"seasonal_features":true/false}

Checkpoint:
1. screen_sharing: Il trainer ha condiviso schermo e mostrato almeno 3 sezioni (dashboard, template, automazioni, campagne, contatti, chat, form, pulsanti chat, ecc.)
2. automation_types: Analizza il transcript e identifica quali TIPI di automazioni la consulente ha mostrato o discusso con il cliente
3. collaborative_work: Analizza il transcript e determina se trainer e cliente hanno lavorato insieme sulle automazioni
4. client_objectives: Analizza il transcript e determina se il consulente ha chiesto gli obiettivi del cliente e quali sono
5. followup_planned: Analizza il transcript e determina se è stato pianificata e concordata una chiamata di follow-up durante la chiamata
6. seasonal_features: Analizza il transcript e determina se il consulente ha menzionato e/o mostrato funzionalità della piattaforma dedicate a eventi specifici (es. Pasqua, Natale, saldi primaverili, ecc.)

Solo JSON, nessun altro testo.`;

async function analyzeMeeting<T>(
  transcript: Array<{ speaker: { display_name: string }; text: string; timestamp: string }>,
  systemPrompt: string,
  meetingType: string
): Promise<T> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

  const transcriptText = transcript
    .map(t => `[${t.timestamp}] ${t.speaker.display_name}: ${t.text}`)
    .join('\n');

  const client = new Anthropic({ apiKey });

  logger.info(`Sending ${meetingType} call transcript to Claude for analysis`, {
    transcriptLength: transcriptText.length,
    linesCount: transcript.length,
  });

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 256,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: `Analizza questa trascrizione di una chiamata di ${meetingType}:\n\n${transcriptText}`,
      },
    ],
  });

  if (response.stop_reason === 'max_tokens') {
    logger.warn(`Claude response truncated (max_tokens reached) for ${meetingType} analysis`);
  }

  let text = response.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('');

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) text = jsonMatch[0];

  try {
    const parsed = JSON.parse(text) as T;
    logger.info(`${meetingType} analysis completed`);
    return parsed;
  } catch (e) {
    logger.error(`Failed to parse Claude response for ${meetingType}`, { 
      text: text.slice(0, 800), 
      stopReason: response.stop_reason 
    });
    throw new Error(`Failed to parse ${meetingType} analysis response`);
  }
}

export async function analyzeActivationCall(
  transcript: Array<{ speaker: { display_name: string }; text: string; timestamp: string }>
): Promise<ActivationAnalysis> {
  return analyzeMeeting<ActivationAnalysis>(transcript, ACTIVATION_SYSTEM_PROMPT, 'activation');
}

export async function analyzeTrainingCall(
  transcript: Array<{ speaker: { display_name: string }; text: string; timestamp: string }>
): Promise<TrainingAnalysis> {
  return analyzeMeeting<TrainingAnalysis>(transcript, TRAINING_SYSTEM_PROMPT, 'training');
}