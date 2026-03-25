import { cn } from '@/lib/utils/cn';
import type { HealthStatus } from '@/types';

const styles: Record<HealthStatus, string> = {
  green: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  yellow: 'bg-amber-100 text-amber-700 border-amber-200',
  red: 'bg-red-100 text-red-700 border-red-200',
};

const labels: Record<HealthStatus, string> = {
  green: 'Sano',
  yellow: 'Attenzione',
  red: 'Critico',
};

interface HealthBadgeProps {
  status: HealthStatus;
  score?: number;
  size?: 'sm' | 'md';
}

export function HealthBadge({ status, score, size = 'md' }: HealthBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border font-medium',
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm',
        styles[status]
      )}
    >
      <span
        className={cn(
          'rounded-full',
          size === 'sm' ? 'w-1.5 h-1.5' : 'w-2 h-2',
          status === 'green' ? 'bg-emerald-500' : status === 'yellow' ? 'bg-amber-500' : 'bg-red-500'
        )}
      />
      {score !== undefined ? `${score}/100` : labels[status]}
    </span>
  );
}
