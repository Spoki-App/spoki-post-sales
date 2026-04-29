'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/lib/store/auth';
import { useNarStore } from '@/lib/store/nar';
import { narApi } from '@/lib/api/client';
import { NarFiltersBar } from '@/components/nar/NarFiltersBar';
import { cn } from '@/lib/utils/cn';

const NAV_ITEMS: Array<{ href: string; label: string }> = [
  { href: '/nar/overview',  label: 'Overview' },
  { href: '/nar/buckets',   label: 'Bucket' },
  { href: '/nar/trend',     label: 'NAR Settimanale' },
  { href: '/nar/churn',     label: 'Churn' },
  { href: '/nar/operators', label: 'Operatore' },
  { href: '/nar/history',   label: 'Storico' },
  { href: '/nar/insights',  label: 'AI Suggest' },
  { href: '/nar/upload',    label: 'Upload' },
];

export default function NarLayout({ children }: { children: React.ReactNode }) {
  const token = useAuthStore(s => s.token);
  const pathname = usePathname();
  const { upload, rows, setDataset, setOperators, setExclusions, setLoading, setError, loading } = useNarStore();

  useEffect(() => {
    if (!token) return;
    let mounted = true;
    setLoading(true);
    setError(null);
    Promise.all([
      narApi.getCurrentDataset(token),
      narApi.listOperators(token),
      narApi.listExclusions(token),
    ])
      .then(([dataset, operators, exclusions]) => {
        if (!mounted) return;
        setDataset(dataset.data?.upload ?? null, dataset.data?.rows ?? []);
        setOperators(operators.data ?? []);
        setExclusions(exclusions.data ?? []);
      })
      .catch(err => {
        if (mounted) setError(err instanceof Error ? err.message : 'Errore caricamento dati NAR');
      })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [token, setDataset, setOperators, setExclusions, setLoading, setError]);

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="px-6 pt-5 pb-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">NAR Analysis</h1>
              <p className="mt-1 text-sm text-slate-500">
                Net Active Ratio — analisi consumo conversazioni vs tier per portafoglio.
              </p>
            </div>
            <DatasetStatus />
          </div>
        </div>

        <nav className="flex flex-wrap gap-1 px-6 pb-2">
          {NAV_ITEMS.map(item => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  active
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>

      <NarFiltersBar />

      <div className="flex-1 overflow-y-auto bg-slate-50 px-6 py-6">
        {loading ? (
          <div className="flex h-64 items-center justify-center text-slate-500">
            Caricamento dati NAR…
          </div>
        ) : !upload || rows.length === 0 ? (
          <NoDatasetEmpty />
        ) : (
          children
        )}
      </div>
    </div>
  );
}

function DatasetStatus() {
  const { upload, rows } = useNarStore();
  if (!upload) return null;
  const date = new Date(upload.uploadedAt);
  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
      <div className="font-semibold">Dataset corrente</div>
      <div className="mt-0.5 text-emerald-700">
        {rows.length.toLocaleString('it-IT')} righe · caricato il {date.toLocaleDateString('it-IT')}{' '}
        {date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
        {upload.uploadedByEmail && <> da {upload.uploadedByEmail}</>}
      </div>
    </div>
  );
}

function NoDatasetEmpty() {
  return (
    <div className="mx-auto max-w-md rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
      <h2 className="text-lg font-semibold text-slate-900">Nessun dataset caricato</h2>
      <p className="mt-2 text-sm text-slate-600">
        Carica il file CSV NAR esportato da Google Sheets per iniziare l&apos;analisi.
      </p>
      <Link
        href="/nar/upload"
        className="mt-5 inline-flex items-center justify-center rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
      >
        Vai a Upload
      </Link>
    </div>
  );
}
