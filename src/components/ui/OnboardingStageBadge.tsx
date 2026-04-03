import { cn } from '@/lib/utils/cn';
import type { OnboardingStageType } from '@/lib/config/pipelines';

const styles: Record<OnboardingStageType, string> = {
  normal:  'bg-blue-50 text-blue-700 border-blue-200',
  warning: 'bg-amber-50 text-amber-700 border-amber-200',
  danger:  'bg-red-50 text-red-700 border-red-200',
};

interface OnboardingStageBadgeProps {
  label: string;
  type: OnboardingStageType;
  size?: 'sm' | 'md';
}

export function OnboardingStageBadge({ label, type, size = 'sm' }: OnboardingStageBadgeProps) {
  return (
    <span className={cn(
      'inline-flex items-center rounded-full border font-medium',
      size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm',
      styles[type]
    )}>
      {label}
    </span>
  );
}
