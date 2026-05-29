import { pgQuery } from '@/lib/db/postgres';
import { getLogger } from '@/lib/logger';
import {
  PROMPT_DEFAULTS,
  renderSystemPrompt,
  type CallType,
  type CheckpointDef,
} from './prompt-defaults';

const logger = getLogger('services:prompt-registry');

export interface PromptTemplate {
  id: string;
  callType: CallType;
  version: string;
  systemPrompt: string;
  checkpoints: CheckpointDef[];
  isActive: boolean;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

const CACHE_TTL_MS = 60_000;

interface CacheEntry { template: PromptTemplate; expiresAt: number }
const activeCache: Map<CallType, CacheEntry> = new Map();

interface DbRow {
  id: string;
  call_type: CallType;
  version: string;
  system_prompt: string;
  checkpoints: CheckpointDef[];
  is_active: boolean;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

function rowToTemplate(row: DbRow): PromptTemplate {
  return {
    id: row.id,
    callType: row.call_type,
    version: row.version,
    systemPrompt: row.system_prompt,
    checkpoints: row.checkpoints,
    isActive: row.is_active,
    notes: row.notes,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function invalidateCache(callType?: CallType): void {
  if (callType) activeCache.delete(callType);
  else activeCache.clear();
}

/**
 * Inserisce in DB il template di default per il call_type, attivandolo.
 * Idempotente: se la versione esiste gia' viene riusata.
 */
async function seedDefault(callType: CallType): Promise<PromptTemplate> {
  const def = PROMPT_DEFAULTS[callType];
  logger.info('Seeding default prompt template', { callType, version: def.version });

  const result = await pgQuery<DbRow>(
    `INSERT INTO prompt_templates (call_type, version, system_prompt, checkpoints, is_active, notes, created_by)
     VALUES ($1, $2, $3, $4::jsonb, TRUE, $5, $6)
     ON CONFLICT (call_type, version) DO UPDATE SET is_active = TRUE
     RETURNING *`,
    [
      callType,
      def.version,
      def.systemPrompt,
      JSON.stringify(def.checkpoints),
      'Default seed da prompt-defaults.ts',
      'system',
    ],
  );
  return rowToTemplate(result.rows[0]);
}

/**
 * Restituisce il template attivo per il call_type. Cache in memoria con TTL,
 * fallback su seed iniziale se la tabella e' vuota, fallback finale sui
 * default in code se il DB e' irraggiungibile.
 */
export async function getActiveTemplate(callType: CallType): Promise<PromptTemplate> {
  const cached = activeCache.get(callType);
  if (cached && cached.expiresAt > Date.now()) return cached.template;

  try {
    const result = await pgQuery<DbRow>(
      `SELECT * FROM prompt_templates WHERE call_type = $1 AND is_active = TRUE LIMIT 1`,
      [callType],
    );
    let template: PromptTemplate;
    if (result.rows.length === 0) {
      template = await seedDefault(callType);
    } else {
      template = rowToTemplate(result.rows[0]);
    }
    activeCache.set(callType, { template, expiresAt: Date.now() + CACHE_TTL_MS });
    return template;
  } catch (err) {
    logger.error('Failed to load active template, using in-code defaults', { callType, error: String(err) });
    const def = PROMPT_DEFAULTS[callType];
    return {
      id: 'fallback',
      callType,
      version: def.version,
      systemPrompt: def.systemPrompt,
      checkpoints: def.checkpoints,
      isActive: true,
      notes: 'Fallback in-code (DB unavailable)',
      createdBy: 'system',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }
}

export async function listTemplates(callType: CallType): Promise<PromptTemplate[]> {
  const result = await pgQuery<DbRow>(
    `SELECT * FROM prompt_templates WHERE call_type = $1 ORDER BY created_at DESC`,
    [callType],
  );
  return result.rows.map(rowToTemplate);
}

export async function getTemplateById(id: string): Promise<PromptTemplate | null> {
  const result = await pgQuery<DbRow>(`SELECT * FROM prompt_templates WHERE id = $1 LIMIT 1`, [id]);
  return result.rows[0] ? rowToTemplate(result.rows[0]) : null;
}

export interface DraftInput {
  systemPrompt: string;
  checkpoints: CheckpointDef[];
  notes?: string | null;
}

/** Validazione: ogni key snake/camel-case unica e non vuota, label non vuoto. */
export function validateCheckpoints(checkpoints: unknown): { ok: true; value: CheckpointDef[] } | { ok: false; error: string } {
  if (!Array.isArray(checkpoints) || checkpoints.length === 0) {
    return { ok: false, error: 'checkpoints deve essere un array non vuoto' };
  }
  const seen = new Set<string>();
  const out: CheckpointDef[] = [];
  for (const item of checkpoints) {
    if (!item || typeof item !== 'object') return { ok: false, error: 'ogni checkpoint deve essere un oggetto' };
    const c = item as Record<string, unknown>;
    const key = typeof c.key === 'string' ? c.key.trim() : '';
    const label = typeof c.label === 'string' ? c.label.trim() : '';
    const description = typeof c.description === 'string' ? c.description.trim() : '';
    if (!key) return { ok: false, error: 'ogni checkpoint deve avere una key non vuota' };
    if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(key)) {
      return { ok: false, error: `key non valida "${key}": usa lettere/numeri/underscore (no spazi)` };
    }
    if (seen.has(key)) return { ok: false, error: `key duplicata: "${key}"` };
    seen.add(key);
    if (!label) return { ok: false, error: `checkpoint "${key}" senza label` };
    if (!description) return { ok: false, error: `checkpoint "${key}" senza description` };
    out.push({ key, label, description });
  }
  return { ok: true, value: out };
}

function generateVersion(callType: CallType): string {
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
  return `${callType}-${stamp}`;
}

export async function createDraft(callType: CallType, input: DraftInput, createdBy: string): Promise<PromptTemplate> {
  const validated = validateCheckpoints(input.checkpoints);
  if (!validated.ok) throw new Error(`Validazione checkpoint fallita: ${validated.error}`);
  if (!input.systemPrompt || !input.systemPrompt.trim()) throw new Error('systemPrompt non puo essere vuoto');

  const version = generateVersion(callType);
  const result = await pgQuery<DbRow>(
    `INSERT INTO prompt_templates (call_type, version, system_prompt, checkpoints, is_active, notes, created_by)
     VALUES ($1, $2, $3, $4::jsonb, FALSE, $5, $6)
     RETURNING *`,
    [
      callType,
      version,
      input.systemPrompt,
      JSON.stringify(validated.value),
      input.notes ?? null,
      createdBy,
    ],
  );
  return rowToTemplate(result.rows[0]);
}

/**
 * Attiva un template. La unique partial index garantisce un solo attivo per call_type:
 * dobbiamo prima disattivare gli altri nella stessa transazione.
 */
export async function activate(id: string): Promise<PromptTemplate> {
  const tpl = await getTemplateById(id);
  if (!tpl) throw new Error(`Template non trovato: ${id}`);

  await pgQuery('BEGIN');
  try {
    await pgQuery(
      `UPDATE prompt_templates SET is_active = FALSE WHERE call_type = $1 AND id <> $2 AND is_active = TRUE`,
      [tpl.callType, id],
    );
    await pgQuery(`UPDATE prompt_templates SET is_active = TRUE WHERE id = $1`, [id]);
    await pgQuery('COMMIT');
  } catch (e) {
    await pgQuery('ROLLBACK');
    throw e;
  }

  invalidateCache(tpl.callType);
  const fresh = await getTemplateById(id);
  if (!fresh) throw new Error('Template scomparso dopo activate');
  return fresh;
}

/**
 * Compone il prompt finale (sostituendo i placeholder dai checkpoint del template).
 */
export function renderTemplate(template: PromptTemplate): string {
  return renderSystemPrompt(template.systemPrompt, template.checkpoints);
}

/** Esposto per uso dei test/dry-run senza toccare la cache. */
export function _resetCacheForTesting(): void {
  invalidateCache();
}

export type { CheckpointDef, CallType };
