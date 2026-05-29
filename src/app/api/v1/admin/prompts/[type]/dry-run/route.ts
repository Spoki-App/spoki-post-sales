import { NextRequest } from 'next/server';
import {
  authenticateRequest,
  createSuccessResponse,
  createErrorResponse,
  ApiError,
  type RouteHandlerContext,
} from '@/lib/api/middleware';
import { isAdminEmail } from '@/lib/config/owners';
import {
  isCallType,
  analyzeWithTemplate,
  type CallType,
} from '@/lib/services/meeting-analysis';
import {
  getActiveTemplate,
  getTemplateById,
  validateCheckpoints,
  type PromptTemplate,
} from '@/lib/services/prompt-registry';
import { loadArchivedTranscript } from '@/lib/services/transcript-archive';

/**
 * Esegue una analisi "a vuoto" con un template specifico (id o inline) su una
 * call gia archiviata. NON salva nulla in DB, NON tocca call_analyses.
 * Body:
 *   {
 *     engagementHubspotId: string,
 *     templateId?: string,                    // se vuoi testare una versione gia in DB
 *     template?: { systemPrompt, checkpoints, notes? }, // se vuoi testare modifiche unsaved
 *   }
 */
export async function POST(request: NextRequest, context: RouteHandlerContext) {
  try {
    const auth = await authenticateRequest(request);
    if (!isAdminEmail(auth.email)) throw new ApiError(403, 'Accesso riservato agli admin');

    const params = await context.params;
    const t = params.type;
    const type = Array.isArray(t) ? t[0] : t;
    if (!isCallType(type)) throw new ApiError(400, "type must be 'activation' or 'training'");

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const engagementHubspotId = typeof body.engagementHubspotId === 'string' ? body.engagementHubspotId : '';
    if (!engagementHubspotId) throw new ApiError(400, 'engagementHubspotId richiesto');

    const template = await resolveTemplate(type, body);

    const transcript = await loadArchivedTranscript(engagementHubspotId);
    if (!transcript || transcript.length === 0) {
      throw new ApiError(
        404,
        "Nessun transcript archiviato per questo engagement. Esegui prima un'analisi normale per archiviarlo, poi riprova il dry-run.",
      );
    }

    const startedAt = Date.now();
    const analysis = await analyzeWithTemplate(template, transcript, type);
    const elapsedMs = Date.now() - startedAt;

    return createSuccessResponse({
      data: {
        engagementHubspotId,
        callType: type,
        templateId: template.id,
        templateVersion: template.version,
        elapsedMs,
        transcriptLines: transcript.length,
        analysis,
      },
    });
  } catch (error) {
    return createErrorResponse(error);
  }
}

async function resolveTemplate(
  type: CallType,
  body: Record<string, unknown>,
): Promise<PromptTemplate> {
  if (typeof body.templateId === 'string' && body.templateId) {
    const tpl = await getTemplateById(body.templateId);
    if (!tpl) throw new ApiError(404, 'Template non trovato');
    if (tpl.callType !== type) {
      throw new ApiError(400, `Template ${tpl.id} appartiene a "${tpl.callType}"`);
    }
    return tpl;
  }

  const inline = body.template as Record<string, unknown> | undefined;
  if (inline && typeof inline === 'object') {
    const systemPrompt = typeof inline.systemPrompt === 'string' ? inline.systemPrompt : '';
    if (!systemPrompt.trim()) throw new ApiError(400, 'template.systemPrompt richiesto');
    const validated = validateCheckpoints(inline.checkpoints);
    if (!validated.ok) throw new ApiError(400, validated.error);
    return {
      id: 'dry-run',
      callType: type,
      version: 'dry-run',
      systemPrompt,
      checkpoints: validated.value,
      isActive: false,
      notes: typeof inline.notes === 'string' ? inline.notes : null,
      createdBy: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  // Default: usa il template attivo se ne' templateId ne' inline e' fornito.
  return getActiveTemplate(type);
}
