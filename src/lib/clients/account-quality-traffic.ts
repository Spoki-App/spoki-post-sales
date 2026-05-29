import { HUBSPOT_COMPANY_PROPS } from '@/lib/config/hubspot-props';

export type AccountQualityTraffic = 'red' | 'yellow' | 'green' | 'neutral';

export type AccountQualityBinary = 'green' | 'red';

function trafficFromChurnRisk(raw: string | null | undefined): AccountQualityTraffic | null {
  if (raw == null) return null;
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  if (/\bred\b|\brosso\b|\bhigh\b|\bcritical\b|\bcritico\b|\bdanger\b|\brisk[_\s-]*high\b/i.test(s)) return 'red';
  if (/\byellow\b|\bgiallo\b|\bmedium\b|\bwarning\b|\battenzione\b|\bamber\b|\brisk[_\s-]*medium\b/i.test(s)) return 'yellow';
  if (/\bgreen\b|\bverde\b|\blow\b|\bgood\b|\bsano\b|\brisk[_\s-]*low\b/i.test(s)) return 'green';
  return null;
}

function safeHubspotJsonKey(internal: string): string | null {
  const k = internal.trim();
  if (!k || !/^[a-zA-Z0-9_]+$/.test(k)) return null;
  return k;
}

/** Reads optional HubSpot company quality score from persisted `raw_properties`. */
export function readAccountQualityScoreFromRaw(raw: unknown): string | null {
  const key = safeHubspotJsonKey(HUBSPOT_COMPANY_PROPS.accountQualityScore);
  if (!key) return null;
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const v = (raw as Record<string, unknown>)[key];
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

function hubspotQualityValueToTraffic(s: string): AccountQualityTraffic | null {
  const compact = s.replace(/\s/g, '').replace(',', '.');
  if (/^\d+(\.\d+)?$/.test(compact)) {
    const n = parseFloat(compact);
    if (!Number.isFinite(n)) return null;
    if (n >= 0 && n <= 100) return n < 50 ? 'red' : 'green';
  }
  return trafficFromChurnRisk(s);
}

export function resolveAccountTrafficLight(
  churnRisk: string | null | undefined,
  onboardingStageType: string | null | undefined
): AccountQualityTraffic {
  const fromHubspot = trafficFromChurnRisk(churnRisk ?? null);
  if (fromHubspot) return fromHubspot;
  if (onboardingStageType === 'danger') return 'red';
  if (onboardingStageType === 'warning') return 'yellow';
  return 'neutral';
}

/** HubSpot optional `accountQualityScore` wins when present and parseable; else churn + onboarding. */
export function resolveAccountQualityTraffic(
  accountQualityScore: string | null | undefined,
  churnRisk: string | null | undefined,
  onboardingStageType: string | null | undefined
): AccountQualityTraffic {
  const qs = accountQualityScore?.trim();
  if (qs) {
    const t = hubspotQualityValueToTraffic(qs);
    if (t) return t;
  }
  return resolveAccountTrafficLight(churnRisk, onboardingStageType);
}

export function toBinaryQuality(light: AccountQualityTraffic): AccountQualityBinary {
  if (light === 'red' || light === 'yellow') return 'red';
  return 'green';
}
