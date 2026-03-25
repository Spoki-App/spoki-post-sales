import { cn } from '@/lib/utils/cn';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'outline' | 'success' | 'warning' | 'danger' | 'info';
  size?: 'sm' | 'md';
  className?: string;
}

const variants = {
  default: 'bg-slate-100 text-slate-700',
  outline: 'bg-white border border-slate-300 text-slate-600',
  success: 'bg-emerald-100 text-emerald-700',
  warning: 'bg-amber-100 text-amber-700',
  danger: 'bg-red-100 text-red-700',
  info: 'bg-blue-100 text-blue-700',
};

export function Badge({ children, variant = 'default', size = 'md', className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full font-medium',
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm',
        variants[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
