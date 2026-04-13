/**
 * NPS stimato da segnali di utilizzo/adoption (non da survey HubSpot).
 * Output in scala -100 … +100, analogo alla formula NPS (promotori − detrattori).
 */

export interface UsageNpsInput {
  healthScore0to100: number | null;
  onboardingPct0to100: number | null;
  daysSinceLastContact: number | null;
  openTicketsCount: number;
  openHighTicketsCount: number;
  engagementsLast30Days: number;
}

function contactScore(days: number | null): number {
  if (days === null) return 45;
  if (days <= 7) return 100;
  if (days <= 14) return 85;
  if (days <= 30) return 70;
  if (days <= 60) return 50;
  if (days <= 90) return 30;
  return 15;
}

function ticketFrictionScore(open: number, openHigh: number): number {
  const penalty = Math.min(100, openHigh * 22 + open * 6);
  return Math.max(0, 100 - penalty);
}

function engagementActivityScore(count30d: number): number {
  return Math.min(100, count30d * 18);
}

export function computeUsageBasedNps(input: UsageNpsInput): { value: number; summary: string } {
  const h = input.healthScore0to100 ?? 55;
  const o = input.onboardingPct0to100 ?? 0;
  const c = contactScore(input.daysSinceLastContact);
  const t = ticketFrictionScore(input.openTicketsCount, input.openHighTicketsCount);
  const e = engagementActivityScore(input.engagementsLast30Days);

  const usageIndex =
    0.32 * h + 0.18 * o + 0.18 * c + 0.14 * t + 0.18 * e;

  const value = Math.round(Math.max(-100, Math.min(100, 2 * usageIndex - 100)));

  const summary = [
    `NPS stimato da utilizzo: ${value} (scala −100…+100).`,
    `Componenti: health ${Math.round(h)}/100, onboarding ${Math.round(o)}%, contatti recenti ${Math.round(c)}/100, attrito ticket ${Math.round(t)}/100, attività ultimi 30gg ${Math.round(e)}/100 (${input.engagementsLast30Days} interazioni).`,
  ].join(' ');

  return { value, summary };
}
