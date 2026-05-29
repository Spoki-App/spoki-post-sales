import { HUBSPOT_COMPANY_PROPS } from '@/lib/config/hubspot-props';

function safeHubspotJsonKey(internal: string): string | null {
  const k = internal.trim();
  if (!k || !/^[a-zA-Z0-9_]+$/.test(k)) return null;
  return k;
}

function parseConversationInt(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === 'number' && Number.isFinite(v)) return Math.round(v);
  if (typeof v === 'string') {
    const s = v.trim().replace(/\s/g, '');
    if (!s) return null;
    const n = Number(s.replace(/,/g, ''));
    return Number.isFinite(n) ? Math.round(n) : null;
  }
  return null;
}

export interface PlanUsageNumbers {
  used: number;
  included: number;
}

export function planUsageFromRawProperties(raw: unknown): PlanUsageNumbers | null {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const usedKey = safeHubspotJsonKey(HUBSPOT_COMPANY_PROPS.conversationsUsed);
  const inclKey = safeHubspotJsonKey(HUBSPOT_COMPANY_PROPS.conversationsIncluded);
  if (!usedKey || !inclKey) return null;
  const used = parseConversationInt(obj[usedKey]);
  const included = parseConversationInt(obj[inclKey]);
  if (used == null || included == null) return null;
  return { used, included };
}
