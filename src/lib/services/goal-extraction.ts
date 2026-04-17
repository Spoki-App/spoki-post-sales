import { pgQuery } from '@/lib/db/postgres';
import { generateJson } from './gemini';
import { getLogger } from '@/lib/logger';

const logger = getLogger('services:goal-extraction');

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
  raw_properties: Record<string, unknown> | null;
}

const RAW_TEXT_KEYS = [
  'hs_email_subject',
  'hs_email_text',
  'hs_call_title',
  'hs_call_body',
  'hs_meeting_title',
  'hs_meeting_body',
  'hs_internal_meeting_notes',
  'hs_note_body',
  'hs_body_preview',
  'hs_task_subject',
  'hs_task_type',
] as const;

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

function textFromEngagementRaw(raw: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const k of RAW_TEXT_KEYS) {
    const v = raw[k];
    if (typeof v === 'string' && v.trim()) parts.push(v.trim());
  }
  return parts.join('\n\n');
}

export async function extractGoalsForClient(clientId: string): Promise<number> {
  const engRes = await pgQuery<EngagementRow>(
    `SELECT e.id, e.type, e.occurred_at, e.title, e.raw_properties
     FROM engagements e
     LEFT JOIN contacts co ON e.contact_id = co.id
     WHERE e.client_id = $1 OR co.client_id = $1
     ORDER BY e.occurred_at DESC
     LIMIT 80`,
    [clientId]
  );

  const engagements = engRes.rows;
  if (engagements.length === 0) {
    logger.info('No engagements found for client', { clientId });
    return 0;
  }

  const playbooks: string[] = [];
  const otherEngagements: string[] = [];

  engagements.forEach((e, i) => {
    const date = new Date(e.occurred_at).toISOString().slice(0, 10);
    const raw = parseRawProperties(e.raw_properties);
    const content = textFromEngagementRaw(raw) || (e.title ?? '').trim();
    if (!content.trim()) return;

    const hasStructuredFields = content.includes('##') || content.includes('**') || content.length > 500;

    if (e.type === 'NOTE' && hasStructuredFields) {
      playbooks.push(`[PLAYBOOK ${i}] Date: ${date}\n${content.slice(0, 3000)}`);
    } else {
      const typeLabel = e.type === 'CALL' ? 'Call' : e.type === 'EMAIL' ? 'Email' : e.type === 'MEETING' ? 'Meeting' : e.type;
      otherEngagements.push(`[${typeLabel} ${i}] Date: ${date}\n${content.slice(0, 1500)}`);
    }
  });

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

  let parsed: ExtractedGoal[];
  try {
    parsed = JSON.parse(rawJson);
    if (!Array.isArray(parsed)) parsed = [];
  } catch {
    logger.error('Failed to parse AI response', { rawJson: rawJson.slice(0, 500) });
    return 0;
  }

  let inserted = 0;
  for (const goal of parsed) {
    if (!goal.title) continue;

    const engagementId = goal.engagementIndex !== null && goal.engagementIndex < engagements.length
      ? engagements[goal.engagementIndex].id
      : null;

    const source = goal.fromPlaybook ? 'playbook' : 'ai_extracted';

    await pgQuery(
      `INSERT INTO client_goals (client_id, title, description, status, source, source_engagement_id, mentioned_at, created_by)
       VALUES ($1, $2, $3, 'active', $4, $5, $6, 'ai')
       ON CONFLICT DO NOTHING`,
      [clientId, goal.title.slice(0, 200), goal.description || null, source, engagementId, goal.mentionedAt || null]
    );
    inserted++;
  }

  logger.info('Goals extracted and inserted', { clientId, total: parsed.length, inserted });
  return inserted;
}
