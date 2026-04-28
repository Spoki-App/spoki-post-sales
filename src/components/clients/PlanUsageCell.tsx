import { Badge } from '@/components/ui/Badge';
import { planTierAbbrev } from '@/lib/clients/plan-tier-abbrev';
import type { ClientPlanUsage } from '@/types';

interface PlanUsageCellProps {
  plan?: string | null;
  planUsage?: ClientPlanUsage | null;
}

export function PlanUsageCell({ plan, planUsage }: PlanUsageCellProps) {
  const abbrev = planTierAbbrev(plan ?? null);
  const hasUsage = planUsage != null && planUsage.used >= 0 && planUsage.included >= 0;

  if (hasUsage && abbrev) {
    return (
      <span className="text-sm font-medium tabular-nums text-slate-800">
        {planUsage.used} <span className="mx-0.5 font-normal text-slate-400">|</span> {planUsage.included}{' '}
        <span className="text-slate-600">{abbrev}</span>
      </span>
    );
  }

  if (hasUsage) {
    return (
      <span className="text-sm font-medium tabular-nums text-slate-800">
        {planUsage.used} <span className="mx-0.5 font-normal text-slate-400">|</span> {planUsage.included}
      </span>
    );
  }

  if (abbrev) {
    return (
      <span className="text-sm text-slate-700" title={plan ?? undefined}>
        <span className="font-medium tabular-nums text-slate-400">—</span>
        <span className="mx-0.5 font-normal text-slate-400">|</span>
        <span className="font-medium tabular-nums text-slate-400">—</span>{' '}
        <span className="text-slate-600">{abbrev}</span>
      </span>
    );
  }

  if (plan) {
    return (
      <Badge variant="outline" size="sm">
        {plan}
      </Badge>
    );
  }

  return <span className="text-slate-400 text-xs">—</span>;
}
