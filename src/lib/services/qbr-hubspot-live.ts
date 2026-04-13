import { getHubSpotClient, type HSEngagement } from '@/lib/hubspot/client';
import { getLogger } from '@/lib/logger';

const logger = getLogger('services:qbr-hubspot-live');

const QBR_TYPES = new Set(['EMAIL', 'INCOMING_EMAIL', 'MEETING', 'NOTE']);

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

function trunc(s: string, max: number): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length <= max ? t : `${t.slice(0, max)}...`;
}

function prop(e: HSEngagement, key: string): string {
  const v = e.rawProperties[key];
  return typeof v === 'string' ? v : '';
}

function namePart(e: HSEngagement, first: string, last: string): string {
  return `${prop(e, first).trim()} ${prop(e, last).trim()}`.trim();
}

export interface QbrLiveData {
  emailMeetingLines: string[];
  playbookBlocks: string[];
  emailCount: number;
  meetingCount: number;
  occurredAts: string[];
}

/**
 * Fetches emails, meetings and playbook notes directly from HubSpot API
 * for a single company + its contacts. No DB dependency.
 */
export async function fetchQbrDataFromHubSpot(companyHubspotId: string): Promise<QbrLiveData> {
  const client = getHubSpotClient();

  const contacts = await client.getContactsForCompanies([companyHubspotId]);
  const contactIds = contacts.map(c => c.id);

  logger.info(`QBR live fetch: company ${companyHubspotId}, ${contactIds.length} contacts`);

  const companyEngagements = await client.getEngagementsForCompanies([companyHubspotId]);
  const contactEngagements = contactIds.length > 0
    ? await client.getEngagementsForContacts(contactIds)
    : [];

  const seen = new Set<string>();
  const all: HSEngagement[] = [];
  for (const e of [...companyEngagements, ...contactEngagements]) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    if (QBR_TYPES.has(e.type)) all.push(e);
  }

  all.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));

  const emailMeetingLines: string[] = [];
  const playbookBlocks: string[] = [];
  let emailCount = 0;
  let meetingCount = 0;
  const occurredAts: string[] = [];

  for (const e of all) {
    const d = e.occurredAt.slice(0, 10);
    occurredAts.push(e.occurredAt);

    if (e.type === 'NOTE') {
      const body = stripHtml(prop(e, 'hs_note_body') || prop(e, 'hs_body_preview'));
      if (/^playbook:|^playbook\s+onboarding|handoff/i.test(body.trim())) {
        const kind = classifyPlaybook(body);
        playbookBlocks.push(`[${d}] ${kind}\n${trunc(body, 1800)}`);
      }
      continue;
    }

    if (e.type === 'EMAIL' || e.type === 'INCOMING_EMAIL') {
      emailCount++;
      const subj = trunc(stripHtml(prop(e, 'hs_email_subject')), 180);
      const body = trunc(stripHtml(prop(e, 'hs_email_text')), 380);
      const from = namePart(e, 'hs_email_from_firstname', 'hs_email_from_lastname');
      const to = namePart(e, 'hs_email_to_firstname', 'hs_email_to_lastname');
      const who = [from && `da ${from}`, to && `a ${to}`].filter(Boolean).join(', ');
      const bits = [`${d} | Email`, subj && `Oggetto: ${subj}`, who || undefined, body && `Testo: ${body}`].filter(Boolean) as string[];
      emailMeetingLines.push(trunc(bits.join(' | '), 520));
    }

    if (e.type === 'MEETING') {
      meetingCount++;
      const heading = deriveMeetingHeading(e);
      const mb = stripHtml(prop(e, 'hs_meeting_body'));
      const mn = stripHtml(prop(e, 'hs_internal_meeting_notes'));
      const note = trunc((mb || mn).replace(/\s+/g, ' '), 220);
      const bits = [`${d} | MEETING`, `TITOLO_PER_QBR: ${heading}`, note && `Dettagli_brevi: ${note}`].filter(Boolean) as string[];
      emailMeetingLines.push(trunc(bits.join(' | '), 720));
    }
  }

  logger.info(`QBR live: ${emailCount} emails, ${meetingCount} meetings, ${playbookBlocks.length} playbook notes`);
  return { emailMeetingLines, playbookBlocks, emailCount, meetingCount, occurredAts };
}

function deriveMeetingHeading(e: HSEngagement): string {
  const hub = (prop(e, 'hs_meeting_title') || e.title || '').trim();
  if (hub && !/^meetings?$/i.test(hub)) return trunc(hub, 160);

  const body = stripHtml(prop(e, 'hs_meeting_body'));
  const notes = stripHtml(prop(e, 'hs_internal_meeting_notes'));
  const combined = `${body} ${notes}`.replace(/\s+/g, ' ').trim();

  if (/onboarding\s*\|\s*activation call/i.test(combined)) return 'Onboarding | Activation Call';

  const parts = combined.split(/join link for google meet/i);
  if (parts[0] && parts[0].trim().length > 2) {
    const head = parts[0].trim().replace(/[|:\s,]+$/g, '');
    if (head.length > 2) return trunc(head, 160);
  }

  if (combined.length > 10) return trunc(combined, 160);
  return 'Meeting senza titolo ne descrizione in HubSpot';
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
