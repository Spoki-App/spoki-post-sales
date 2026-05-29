export type ClientSegment = 'Enterprise' | 'Growth' | 'SMB';
export type ClientUxiStatus = 'attivo' | 'onboarding' | 'a_rischio';

export function clientSegmentFromRow(plan: string | null, mrr: number | null): ClientSegment {
  const p = (plan ?? '').toLowerCase();
  if (mrr != null && mrr >= 4000) return 'Enterprise';
  if (p.includes('enterprise') || p.includes('premium')) return 'Enterprise';
  if (mrr != null && mrr >= 800) return 'Growth';
  if (p.includes('pro') || p.includes('scale')) return 'Growth';
  return 'SMB';
}

export function clientUxiStatusFromRow(
  churnRisk: string | null,
  onboardingStatus: string | null,
  health: { status: string | null }
): { key: ClientUxiStatus; label: string; dot: 'emerald' | 'amber' | 'rose' } {
  const cr = (churnRisk ?? '').toLowerCase();
  if (cr.includes('high') || cr.includes('alto') || health.status === 'red') {
    return { key: 'a_rischio', label: 'A rischio', dot: 'rose' };
  }
  const ob = (onboardingStatus ?? '').toLowerCase();
  if (ob && ob !== 'complete' && !ob.includes('complet') && (ob.includes('progress') || ob.includes('not_started') || ob.includes('in_corso'))) {
    return { key: 'onboarding', label: 'Onboarding', dot: 'amber' };
  }
  if (health.status === 'yellow' && !ob.includes('complete')) {
    return { key: 'onboarding', label: 'Onboarding', dot: 'amber' };
  }
  return { key: 'attivo', label: 'Attivo', dot: 'emerald' };
}

/** Display label for industry_spoki in UI. */
export function prettyIndustryTitle(raw: string | null | undefined): string {
  if (raw == null || !String(raw).trim()) return 'Altre industry';
  const parts = String(raw)
    .trim()
    .split(/[-_/\s]+/g)
    .filter(Boolean)
    .map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase());
  if (parts.length >= 2) return `${parts[0]} & ${parts.slice(1).join(' ')}`;
  return parts[0] ?? 'Altre industry';
}
