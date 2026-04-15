import Anthropic from '@anthropic-ai/sdk';
import { getLogger } from '@/lib/logger';

const logger = getLogger('services:activation-analysis');

export interface ActivationAnalysis {
  metaBusinessManager: boolean;
  numberTested: boolean;
  optInAutomation: boolean;
  discoveryDone: boolean;
  smsExplained: boolean;
  nextMeetingBooked: boolean;
  followUpEmailMentioned: boolean;
}

const CHECKPOINT_LABELS: Record<keyof ActivationAnalysis, string> = {
  metaBusinessManager: 'Configurazione Meta Business Manager',
  numberTested: 'Test numero attivato (invio e ricezione)',
  optInAutomation: 'Creazione automazione opt-in su Spoki',
  discoveryDone: 'Discovery e personalizzazione',
  smsExplained: 'Spiegazione funzionalita SMS',
  nextMeetingBooked: 'Programmato incontro successivo',
  followUpEmailMentioned: 'Comunicata email follow-up con questionario',
};

export { CHECKPOINT_LABELS };

const SYSTEM_PROMPT = `Analizza la trascrizione di una chiamata di attivazione Spoki (piattaforma WhatsApp Business).

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

export async function analyzeActivationCall(
  transcript: Array<{ speaker: { display_name: string }; text: string; timestamp: string }>
): Promise<ActivationAnalysis> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

  const transcriptText = transcript
    .map(t => `[${t.timestamp}] ${t.speaker.display_name}: ${t.text}`)
    .join('\n');

  const client = new Anthropic({ apiKey });

  logger.info('Sending activation call transcript to Claude for analysis', {
    transcriptLength: transcriptText.length,
    linesCount: transcript.length,
  });

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 256,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Analizza questa trascrizione di una chiamata di attivazione:\n\n${transcriptText}`,
      },
    ],
  });

  if (response.stop_reason === 'max_tokens') {
    logger.warn('Claude response truncated (max_tokens reached)');
  }

  let text = response.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('');

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) text = jsonMatch[0];

  try {
    const parsed = JSON.parse(text) as ActivationAnalysis;
    logger.info('Activation analysis completed');
    return parsed;
  } catch (e) {
    logger.error('Failed to parse Claude response', { text: text.slice(0, 800), stopReason: response.stop_reason });
    throw new Error('Failed to parse activation analysis response');
  }
}
