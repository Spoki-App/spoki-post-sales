const MAX_LINE = 520;
const MAX_SNIPPET = 380;

function trunc(s: string, max: number): string {
  const t = s.replace(/\s+/g, ' ').trim();
  if (!t) return '';
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function strProp(raw: Record<string, unknown>, key: string): string {
  const v = raw[key];
  return typeof v === 'string' ? v : '';
}

function namePart(raw: Record<string, unknown>, first: string, last: string): string {
  return `${strProp(raw, first).trim()} ${strProp(raw, last).trim()}`.trim();
}

function parseRawProperties(raw_properties: unknown): Record<string, unknown> {
  if (raw_properties && typeof raw_properties === 'object' && !Array.isArray(raw_properties)) {
    return raw_properties as Record<string, unknown>;
  }
  if (typeof raw_properties === 'string') {
    try {
      return JSON.parse(raw_properties || '{}') as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return {};
}

/** node-pg often returns timestamptz as Date; UI/API types may say string. */
function isoDatePrefix(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === 'string' && value.length >= 10) {
    return value.slice(0, 10);
  }
  return '?';
}

/** HubSpot spesso lascia hs_meeting_title vuoto o "MEETINGS"; il titolo utile sta nel body prima del link Meet. */
function deriveMeetingHeading(raw: Record<string, unknown>, rowTitle: string | null): string {
  const hub = (strProp(raw, 'hs_meeting_title') || rowTitle || '').trim();
  if (hub && !/^meetings?$/i.test(hub)) return trunc(hub, 160);

  const body = stripHtml(strProp(raw, 'hs_meeting_body'));
  const notes = stripHtml(strProp(raw, 'hs_internal_meeting_notes'));
  const combined = `${body} ${notes}`.replace(/\s+/g, ' ').trim();

  const mOnb = combined.match(/onboarding\s*\|\s*activation call/i);
  if (mOnb) return 'Onboarding | Activation Call';

  const parts = combined.split(/join link for google meet/i);
  if (parts[0] && parts[0].trim().length > 2) {
    const head = parts[0].trim().replace(/[|:\s,]+$/g, '');
    if (head.length > 2) return trunc(head, 160);
  }

  if (combined.length > 10) return trunc(combined, 160);

  return 'Meeting senza titolo ne descrizione in HubSpot';
}

export function formatEngagementLineForQbr(row: {
  type: string;
  occurred_at: string | Date;
  title: string | null;
  raw_properties: unknown;
}): string {
  const raw = parseRawProperties(row.raw_properties);
  const d = isoDatePrefix(row.occurred_at);
  const t = row.type;

  if (t === 'EMAIL' || t === 'INCOMING_EMAIL') {
    const subj = trunc(stripHtml(strProp(raw, 'hs_email_subject')), 180);
    const body = trunc(stripHtml(strProp(raw, 'hs_email_text')), MAX_SNIPPET);
    const from = namePart(raw, 'hs_email_from_firstname', 'hs_email_from_lastname');
    const to = namePart(raw, 'hs_email_to_firstname', 'hs_email_to_lastname');
    const who = [from && `da ${from}`, to && `a ${to}`].filter(Boolean).join(', ');
    const bits = [`${d} | Email`, subj && `Oggetto: ${subj}`, who || undefined, body && `Testo: ${body}`].filter(Boolean) as string[];
    return trunc(bits.join(' | '), MAX_LINE);
  }

  if (t === 'MEETING') {
    const heading = deriveMeetingHeading(raw, row.title);
    const mb = stripHtml(strProp(raw, 'hs_meeting_body'));
    const mn = stripHtml(strProp(raw, 'hs_internal_meeting_notes'));
    const noteRaw = mb || mn;
    const note = noteRaw ? trunc(noteRaw.replace(/\s+/g, ' '), 220) : '';
    const bits = [`${d} | MEETING`, `TITOLO_PER_QBR: ${heading}`, note && `Dettagli_brevi: ${note}`].filter(Boolean) as string[];
    return trunc(bits.join(' | '), 720);
  }

  if (t === 'CALL') {
    const ct = trunc(strProp(raw, 'hs_call_title'), 140) || 'Chiamata';
    const cb = trunc(stripHtml(strProp(raw, 'hs_call_body')), MAX_SNIPPET);
    const dir = strProp(raw, 'hs_call_direction');
    const disp = strProp(raw, 'hs_call_disposition');
    const meta = [dir && `direzione ${dir}`, disp && `esito ${disp}`].filter(Boolean).join(', ');
    const bits = [`${d} | Chiamata`, ct, meta || undefined, cb && `Note: ${cb}`].filter(Boolean) as string[];
    return trunc(bits.join(' | '), MAX_LINE);
  }

  return trunc(`${d} | ${t}: ${row.title ?? t}`, MAX_LINE);
}

export function buildEngagementTimelineForPrompt(lines: string[]): string {
  if (lines.length === 0) {
    return '(Nessuna email o meeting negli ultimi record sincronizzati su HubSpot. Esegui la sync degli engagement: servono hs_email_subject, hs_email_text, hs_meeting_title e note meeting.)';
  }
  return lines.join('\n');
}

const PLAYBOOK_PATTERN = /^playbook:|^🤝\s*handoff|^playbook\s+onboarding/i;
const MAX_PLAYBOOK_BODY = 1800;

export function isPlaybookNote(raw_properties: unknown): boolean {
  const raw = parseRawProperties(raw_properties);
  const body = stripHtml(strProp(raw, 'hs_note_body') || strProp(raw, 'hs_body_preview'));
  return PLAYBOOK_PATTERN.test(body.trim());
}

function classifyPlaybook(body: string): string {
  const t = body.trim();
  if (/^playbook:\s*followup\s*call\s*2/i.test(t)) return 'FOLLOWUP CALL 2';
  if (/^playbook:\s*followup\s*call\s*1/i.test(t)) return 'FOLLOWUP CALL 1';
  if (/^playbook:\s*training/i.test(t)) return 'TRAINING CALL';
  if (/^playbook:\s*activation/i.test(t)) return 'ACTIVATION CALL';
  if (/^playbook\s+onboarding\s+post\s*training/i.test(t)) return 'POST TRAINING (manuale)';
  if (/^playbook\s+onboarding\s+post\s*activation/i.test(t)) return 'POST ACTIVATION (manuale)';
  if (/handoff/i.test(t)) return 'HANDOFF SALES → CS';
  return 'PLAYBOOK';
}

export function formatPlaybookNoteForQbr(row: {
  occurred_at: string | Date;
  raw_properties: unknown;
}): string {
  const raw = parseRawProperties(row.raw_properties);
  const body = stripHtml(strProp(raw, 'hs_note_body') || strProp(raw, 'hs_body_preview'));
  if (!body) return '';
  const d = isoDatePrefix(row.occurred_at);
  const kind = classifyPlaybook(body);
  return `[${d}] ${kind}\n${trunc(body, MAX_PLAYBOOK_BODY)}`;
}

export function buildPlaybookContextForPrompt(blocks: string[]): string {
  if (blocks.length === 0) return '';
  return blocks.filter(Boolean).join('\n---\n');
}

export function periodRangeFromOccurrences(occurredAts: unknown[]): string {
  const times: number[] = [];
  for (const v of occurredAts) {
    if (v instanceof Date && !Number.isNaN(v.getTime())) {
      times.push(v.getTime());
    } else if (typeof v === 'string') {
      const t = Date.parse(v);
      if (!Number.isNaN(t)) times.push(t);
    }
  }
  if (times.length === 0) return 'non disponibile';
  const min = new Date(Math.min(...times));
  const max = new Date(Math.max(...times));
  const f = (d: Date) => d.toISOString().slice(0, 10);
  if (min.getTime() === max.getTime()) return f(min);
  return `dal ${f(min)} al ${f(max)}`;
}
