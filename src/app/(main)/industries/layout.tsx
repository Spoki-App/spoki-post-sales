'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { Bell, Search } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { OverviewPanorama } from '@/components/industries/OverviewPanorama';

const TABS = [
  { href: '/industries', label: 'Panoramica', match: (p: string) => p === '/industries' || p === '/industries/' },
  { href: '/industries/clients', label: 'Clienti per industry', match: (p: string) => p.startsWith('/industries/clients') },
  {
    href: '/industries/library',
    label: 'Casi d\'uso & Case study',
    match: (p: string) => p.startsWith('/industries/library'),
  },
  { href: '/industries/qbr', label: 'QBR per industry', match: (p: string) => p.startsWith('/industries/qbr') },
] as const;

export default function IndustriesLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [headerQ, setHeaderQ] = useState('');

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    const q = headerQ.trim();
    if (q) router.push(`/industries/clients?q=${encodeURIComponent(q)}`);
    else router.push('/industries/clients');
  };

  const isPanoramica = pathname === '/industries' || pathname === '/industries/';

  return (
    <div className="min-h-full bg-[#f6f7f9]">
      <div className="mx-auto max-w-[1400px] px-4 py-5 md:px-8 md:py-7">
        <div className="flex flex-col gap-4 border-b border-slate-200/80 pb-5 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Industries</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">
              Tutte le industry e i relativi insight, clienti, casi d&apos;uso e QBR.
            </p>
          </div>
          <div className="flex w-full max-w-md items-center gap-2">
            <form onSubmit={onSearch} className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={headerQ}
                onChange={e => setHeaderQ(e.target.value)}
                placeholder="Cerca aziende, industry, contenuti…"
                className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-800 shadow-sm placeholder:text-slate-400 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
              />
            </form>
            <button
              type="button"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm hover:bg-slate-50"
              aria-label="Notifiche"
            >
              <Bell className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-1">
          {TABS.map(t => {
            const active = t.match(pathname);
            return (
              <Link
                key={t.href}
                href={t.href}
                className={cn(
                  'rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
                  active
                    ? 'bg-violet-600 text-white shadow-sm'
                    : 'bg-white text-slate-600 shadow-sm border border-slate-200/80 hover:bg-slate-50'
                )}
              >
                {t.label}
              </Link>
            );
          })}
        </div>

        <div className="mt-8">
          {isPanoramica ? <OverviewPanorama /> : children}
        </div>
      </div>
    </div>
  );
}
