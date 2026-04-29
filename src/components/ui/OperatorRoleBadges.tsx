import { cn } from '@/lib/utils/cn';
import { HUBSPOT_OWNERS, type HubSpotOwner } from '@/lib/config/owners';

interface OperatorRoleBadgesProps {
  ownerId?: string | null;
  owner?: HubSpotOwner | null;
  size?: 'xs' | 'sm';
  theme?: 'light' | 'dark';
  className?: string;
}

const sizeClasses = {
  xs: 'px-1.5 py-px text-[10px]',
  sm: 'px-2 py-0.5 text-xs',
} as const;

const ROLE_STYLES = {
  light: {
    onboarding: 'bg-blue-50 text-blue-700 border-blue-200',
    success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  dark: {
    onboarding: 'bg-blue-900/50 text-blue-100 border-blue-700/60',
    success: 'bg-emerald-700/60 text-emerald-100 border-emerald-600/60',
  },
} as const;

const ROLE_LABELS = {
  onboarding: 'Onboarding',
  success: 'Success',
} as const;

/**
 * Renders 0, 1, or 2 chips next to an operator name based on `isOnboardingOperator`
 * / `isSuccessOperator` flags in HUBSPOT_OWNERS. Returns null when the owner has neither role
 * (or is not in the static map), so it can be dropped in next to any owner name without guards.
 */
export function OperatorRoleBadges({ ownerId, owner, size = 'xs', theme = 'light', className }: OperatorRoleBadgesProps) {
  const resolved = owner ?? (ownerId ? HUBSPOT_OWNERS[ownerId] : null);
  if (!resolved) return null;

  const roles: (keyof typeof ROLE_LABELS)[] = [];
  if (resolved.isOnboardingOperator) roles.push('onboarding');
  if (resolved.isSuccessOperator) roles.push('success');
  if (roles.length === 0) return null;

  const palette = ROLE_STYLES[theme];

  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      {roles.map(role => (
        <span
          key={role}
          className={cn(
            'inline-flex items-center rounded-full border font-medium leading-none',
            sizeClasses[size],
            palette[role]
          )}
        >
          {ROLE_LABELS[role]}
        </span>
      ))}
    </span>
  );
}
