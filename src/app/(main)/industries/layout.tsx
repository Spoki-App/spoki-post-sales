'use client';

import { usePathname } from 'next/navigation';
import { Bell } from 'lucide-react';
import { OverviewPanorama } from '@/components/industries/OverviewPanorama';

export default function IndustriesLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPanoramica = pathname === '/industries' || pathname === '/industries/';

  return (
    <div className="min-h-full bg-[#f6f7f9]">
      <div className="mx-auto max-w-[1400px] px-4 py-5 md:px-8 md:py-7">
        <div className="flex flex-col gap-4 border-b border-slate-200/80 pb-5 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Industries</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">
              Mix del portafoglio per industry: card, grafici e drill-down sui clienti.
            </p>
          </div>
          <div className="flex w-full max-w-md items-center justify-end gap-2 md:justify-end">
            <button
              type="button"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm hover:bg-slate-50"
              aria-label="Notifiche"
            >
              <Bell className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="mt-8">{isPanoramica ? <OverviewPanorama /> : children}</div>
      </div>
    </div>
  );
}
