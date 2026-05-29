import Anthropic from '@anthropic-ai/sdk';
import { getLogger } from '@/lib/logger';
import {
  getActiveTemplate,
  renderTemplate,
  type PromptTemplate,
} from './prompt-registry';
import {
  PROMPT_DEFAULTS,
  renderSystemPrompt,
  type CallType as DefaultsCallType,
} from './prompt-defaults';

const logger = getLogger('services:meeting-analysis');

export type CallType = DefaultsCallType;
export type Confidence = 'low' | 'medium' | 'high';

export interface CheckpointResult {
  passed: boolean;
  evidence: string | null;
  confidence: Confidence;
}

export type CallAnalysis = Record<string, CheckpointResult>;

// Legacy union types - kept as `string` aliases for backward compat with older
// imports. New code should use `string` directly.
export type ActivationCheckpointKey = string;
export type TrainingCheckpointKey = string;
export type ActivationAnalysis = Record<string, CheckpointResult>;
export type TrainingAnalysis = Record<string, CheckpointResult>;

// Legacy label maps -- kept as fallback for any caller that still references
// them. The source of truth is now the prompt_templates table.
export const ACTIVATION_CHECKPOINT_LABELS: Record<string, string> = Object.fromEntries(
  PROMPT_DEFAULTS.activation.checkpoints.map(c => [c.key, c.label]),
);
export const TRAINING_CHECKPOINT_LABELS: Record<string, string> = Object.fromEntries(
  PROMPT_DEFAULTS.training.checkpoints.map(c => [c.key, c.label]),
);
export const CHECKPOINT_LABELS = ACTIVATION_CHECKPOINT_LABELS;

function normalizeCheckpoint(value: unknown): CheckpointResult {
  if (typeof value === 'boolean') {
    return { passed: value, evidence: null, confidence: 'low' };
  }
  if (value && typeof value === 'object') {
    const v = value as Record<string, unknown>;
    const passed = Boolean(v.passed);
    const evidenceRaw = typeof v.evidence === 'string' ? v.evidence.trim() : null;
    const evidence = evidenceRaw && evidenceRaw.length > 0 ? evidenceRaw.slice(0, 400) : null;
    const conf = String(v.confidence ?? 'medium').toLowerCase();
    const confidence: Confidence =
      conf === 'high' ? 'high' : conf === 'low' ? 'low' : 'medium';
    return { passed, evidence, confidence };
  }
  return { passed: false, evidence: null, confidence: 'low' };
}

function normalizeAnalysis(raw: unknown, keys: readonly string[]): CallAnalysis {
  const out: CallAnalysis = {};
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  for (const k of keys) {
    out[k] = normalizeCheckpoint(obj[k]);
  }
  return out;
}

interface AnalyzeOptions {
  systemPrompt: string;
  keys: readonly string[];
  meetingType: string;
}

async function callClaude(
  transcript: Array<{ speaker: { display_name: string }; text: string; timestamp: string }>,
  opts: AnalyzeOptions,
): Promise<CallAnalysis> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

  const transcriptText = transcript
    .map(t => `[${t.timestamp}] ${t.speaker.display_name}: ${t.text}`)
    .join('\n');

  const client = new Anthropic({ apiKey });

  logger.info(`Sending ${opts.meetingType} call transcript to Claude for analysis`, {
    transcriptLength: transcriptText.length,
    linesCount: transcript.length,
    checkpointsCount: opts.keys.length,
  });

  const response = await client.messages.create({
    model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514',
    // Each checkpoint returns evidence + confidence; budget grows with checkpoint count.
    max_tokens: Math.max(2048, opts.keys.length * 320),
    system: opts.systemPrompt,
    messages: [
      {
        role: 'user',
        content: `Analizza questa trascrizione di una chiamata di ${opts.meetingType}:\n\n${transcriptText}`,
      },
    ],
  });

  if (response.stop_reason === 'max_tokens') {
    logger.warn(`Claude response truncated (max_tokens reached) for ${opts.meetingType} analysis`);
  }

  let text = response.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('');

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) text = jsonMatch[0];

  try {
    const parsed = JSON.parse(text);
    logger.info(`${opts.meetingType} analysis completed`);
    return normalizeAnalysis(parsed, opts.keys);
  } catch (e) {
    logger.error(`Failed to parse Claude response for ${opts.meetingType}`, {
      text: text.slice(0, 800),
      stopReason: response.stop_reason,
      error: String(e),
    });
    throw new Error(`Failed to parse ${opts.meetingType} analysis response`);
  }
}

/**
 * Analizza una trascrizione usando il template attivo per il call_type.
 * Variant principale data-driven via prompt-registry.
 */
export async function analyzeCall(
  callType: CallType,
  transcript: Array<{ speaker: { display_name: string }; text: string; timestamp: string }>,
): Promise<CallAnalysis> {
  const template = await getActiveTemplate(callType);
  return analyzeWithTemplate(template, transcript, callType);
}

/**
 * Variant che accetta un template esplicito (usato dal dry-run dell'admin UI).
 * NON salva nulla in DB. Restituisce solo la CallAnalysis normalizzata.
 */
export async function analyzeWithTemplate(
  template: PromptTemplate,
  transcript: Array<{ speaker: { display_name: string }; text: string; timestamp: string }>,
  meetingType: string,
): Promise<CallAnalysis> {
  const systemPrompt = renderTemplate(template);
  const keys = template.checkpoints.map(c => c.key);
  return callClaude(transcript, { systemPrompt, keys, meetingType });
}

// ─── Legacy wrappers ──────────────────────────────────────────────────────────

export async function analyzeActivationCall(
  transcript: Array<{ speaker: { display_name: string }; text: string; timestamp: string }>,
): Promise<ActivationAnalysis> {
  return analyzeCall('activation', transcript);
}

export async function analyzeTrainingCall(
  transcript: Array<{ speaker: { display_name: string }; text: string; timestamp: string }>,
): Promise<TrainingAnalysis> {
  return analyzeCall('training', transcript);
}

// ─── Runtime config (data-driven) ────────────────────────────────────────────

export interface RuntimeCallConfig {
  type: CallType;
  titlePattern: string;
  labels: Record<string, string>;
  totalCheckpoints: number;
  promptVersion: string;
  analyze: (
    transcript: Array<{ speaker: { display_name: string }; text: string; timestamp: string }>,
  ) => Promise<CallAnalysis>;
}

const STATIC_CONFIG: Record<CallType, { type: CallType; titlePattern: string }> = {
  activation: { type: 'activation', titlePattern: '%activation%' },
  training: { type: 'training', titlePattern: '%training%' },
};

/**
 * Restituisce la config completa per un call_type combinando metadati statici
 * (es. il titlePattern usato per il match SQL) con i dati del template attivo
 * (labels, version, ecc.). E' la nuova API canonica.
 */
export async function getCallConfig(type: CallType): Promise<RuntimeCallConfig> {
  const tpl = await getActiveTemplate(type);
  const labels = Object.fromEntries(tpl.checkpoints.map(c => [c.key, c.label]));
  return {
    type,
    titlePattern: STATIC_CONFIG[type].titlePattern,
    labels,
    totalCheckpoints: tpl.checkpoints.length,
    promptVersion: tpl.version,
    analyze: (transcript) => analyzeWithTemplate(tpl, transcript, type),
  };
}

/**
 * Legacy synchronous lookup for the static portion only (titlePattern).
 * Tutto il resto va recuperato via `getCallConfig()`.
 */
export const CALL_TYPE_CONFIG = STATIC_CONFIG;

export function isCallType(value: string | null | undefined): value is CallType {
  return value === 'activation' || value === 'training';
}

export function splitCheckpointsAndEvidences(
  analysis: CallAnalysis,
): { checkpoints: Record<string, boolean>; evidences: Record<string, { evidence: string | null; confidence: Confidence }> } {
  const checkpoints: Record<string, boolean> = {};
  const evidences: Record<string, { evidence: string | null; confidence: Confidence }> = {};
  for (const [key, result] of Object.entries(analysis)) {
    checkpoints[key] = result.passed;
    evidences[key] = { evidence: result.evidence, confidence: result.confidence };
  }
  return { checkpoints, evidences };
}

// ─── Backward compat: legacy hardcoded prompts (no longer used by analyzers,
// kept exported so any external consumer keeps building) ────────────────────

export const ACTIVATION_SYSTEM_PROMPT = renderSystemPrompt(
  PROMPT_DEFAULTS.activation.systemPrompt,
  PROMPT_DEFAULTS.activation.checkpoints,
);
export const TRAINING_SYSTEM_PROMPT = renderSystemPrompt(
  PROMPT_DEFAULTS.training.systemPrompt,
  PROMPT_DEFAULTS.training.checkpoints,
);
