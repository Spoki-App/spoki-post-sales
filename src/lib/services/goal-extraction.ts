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

interface ExtractedGoal {
  title: string;
  description: string;
  mentionedAt: string | null;
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
  const engRes = await pgQuery<EngagementRow>(
    `SELECT e.id, e.type, e.occurred_at, e.title, e.raw_properties
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
     ORDER BY e.occurred_at DESC
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

  engagements.forEach((e, i) => {
    const date = new Date(e.occurred_at).toISOString().slice(0, 10);
    let content = engagementTextContent(e.type, e.title, e.raw_properties).trim();
    if (!content) content = e.title?.trim() || '';
    if (!content) {
      content =
        '(Nessun testo disponibile: le proprietà HubSpot potrebbero non essere nella sync o il corpo è vuoto.)';
    }

    const hasStructuredFields = content.includes('##') || content.includes('**') || content.length > 500;

    if (e.type === 'NOTE' && hasStructuredFields) {
      playbooks.push(`[PLAYBOOK ${i}] Date: ${date}\n${content.slice(0, 3000)}`);
    } else {
      const typeLabel = e.type === 'CALL' ? 'Call' : e.type === 'EMAIL' ? 'Email' : e.type === 'MEETING' ? 'Meeting' : e.type;
      otherEngagements.push(`[${typeLabel} ${i}] Date: ${date}\n${content.slice(0, 1500)}`);
    }
  });

  const contextLines = playbooks.length + otherEngagements.length;

  const prompt = `You are a Customer Success analyst at Spoki. Analyze the following engagement data for a client and extract concrete OBJECTIVES / GOALS that were agreed upon, discussed, or implied during interactions.

=== STRUCTURED PLAYBOOK NOTES ===
${playbooks.length > 0 ? playbooks.join('\n\n---\n\n') : '(none)'}

=== OTHER ENGAGEMENTS (calls, emails, meetings) ===
${otherEngagements.length > 0 ? otherEngagements.join('\n\n---\n\n') : '(none)'}

Reply ONLY with valid JSON (no markdown, no backticks):
[
  {"title": "short goal title (max 80 chars)", "description": "1-2 sentence description of the goal and context", "mentionedAt": "YYYY-MM-DD", "fromPlaybook": true/false, "engagementIndex": N or null}
]

Rules:
- Extract 3-10 goals maximum, focusing on the most concrete and actionable ones.
- Goals should be things like: feature adoption targets, usage milestones, onboarding checkpoints, integration goals, training objectives, campaign launch targets.
- Do NOT extract generic platitudes like "improve customer satisfaction".
- mentionedAt is the date (YYYY-MM-DD) when this goal was first discussed or agreed upon, taken from the engagement timeline dates. Use the earliest date where this goal appears.
- fromPlaybook should be true only if the goal comes from a structured playbook note.
- engagementIndex is the index number from the engagement (e.g., from "[Call 5]" it would be 5). Use null if unclear.
- If no meaningful goals can be extracted, return an empty array [].
- All text must be in Italian.`;

  const rawJson = await generateJson(prompt);

  const parsed = parseAiJsonArray(rawJson);
  if (parsed.length === 0 && rawJson.trim().length > 0) {
    logger.warn('AI returned no parseable goals', { rawJson: rawJson.slice(0, 400) });
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

    const rawPb = (goal as ExtractedGoal & { fromPlaybook?: unknown }).fromPlaybook;
    const fromPb = rawPb === true || rawPb === 'true';
    const source = fromPb ? 'playbook' : 'ai_extracted';
    const mentionedAt = safeMentionedDate(
      typeof goal.mentionedAt === 'string' ? goal.mentionedAt : goal.mentionedAt != null ? String(goal.mentionedAt) : null
    );

    await pgQuery(
      `INSERT INTO client_goals (client_id, title, description, status, source, source_engagement_id, mentioned_at, created_by)
       VALUES ($1, $2, $3, 'active', $4, $5, $6, 'ai')`,
      [clientId, goal.title.slice(0, 200), goal.description || null, source, engagementId, mentionedAt]
    );
    inserted++;
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
