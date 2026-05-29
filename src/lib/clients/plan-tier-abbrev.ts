function foldDiacritics(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function planTierAbbrev(plan: string | null): string | null {
  if (plan == null) return null;
  const raw = plan.trim();
  if (!raw) return null;
  const t = foldDiacritics(raw).toLowerCase();

  const hasMarketing = /\bmarketing\b/.test(t);
  const hasSales = /\bsales\b|\bvendite\b/.test(t);
  const hasAnnual = /\bannuale\b|\bannual\b|\byearly\b|\byear\b|\banno\b/.test(t);
  const hasQuarter = /\btrimestrale\b|\btrimestre\b|\bquarterly\b|\bqtr\b/.test(t);
  const hasMonth = /\bmensile\b|\bmonthly\b|\bmese\b|\bmonth\b/.test(t);

  if (hasMarketing && hasAnnual) return 'MKA';
  if (hasMarketing && hasQuarter) return 'MKT';
  if (hasMarketing && hasMonth) return 'MKM';
  if (hasSales && hasQuarter) return 'SLT';
  return null;
}
