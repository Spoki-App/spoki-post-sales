'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils/cn';

const TABS = [
  { href: '/industries/clients', label: 'Clienti per industry' },
  { href: '/industries/library', label: 'Casi d’uso e casi studio' },
  { href: '/industries/qbr', label: 'QBR per industry' },
] as const;

export default function IndustriesLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="max-w-7xl mx-auto space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Industries</h1>
        <p className="text-sm text-slate-600 mt-1">
          Segmentazione per <code className="text-xs bg-slate-100 px-1 rounded">industry_spoki</code> (HubSpot).
          Sincronizza i clienti con HubSpot per aggiornare i valori.
        </p>
      </div>
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        {TABS.map(t => {
          const active = pathname === t.href;
          return (
            <Link
              key={t.href}
              href={t.href}
              className={cn(
                'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                active
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
      {children}
    </div>
  );
}
