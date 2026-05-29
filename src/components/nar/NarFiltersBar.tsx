'use client';

import { useMemo } from 'react';
import { useNarStore } from '@/lib/store/nar';
import { availableMonths, availableWeeks } from '@/lib/services/nar-buckets';
import { cn } from '@/lib/utils/cn';
import styles from './nar.module.css';

function sourceBadge(upload: ReturnType<typeof useNarStore.getState>['upload']) {
  if (!upload) return null;
  const isMetabase = upload.source === 'metabase';
  const label = isMetabase ? 'Metabase + HubSpot' : upload.source === 'csv' ? 'CSV manuale' : upload.source;
  const cls = isMetabase
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : 'border-slate-200 bg-slate-50 text-slate-600';
  return (
    <span
      className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium', cls)}
      title={`Ultimo aggiornamento ${new Date(upload.uploadedAt).toLocaleString('it-IT')}`}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', isMetabase ? 'bg-emerald-500' : 'bg-slate-400')} />
      Fonte: {label}
    </span>
  );
}

export function NarFiltersBar() {
  const { rows, upload, filters, setFilterType, toggleMonth, toggleWeek, setExcludeWeekZero, setExcludeWithdrawn } = useNarStore();

  const months = useMemo(() => availableMonths(rows), [rows]);
  const weeks = useMemo(() => availableWeeks(rows), [rows]);

  return (
    <div className="border-b border-slate-200 bg-white px-6 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Filtro:</span>
        {sourceBadge(upload)}
        {(['none', 'month', 'week'] as const).map(t => (
          <button
            key={t}
            type="button"
            onClick={() => setFilterType(t)}
            className={cn(
              'rounded-md px-3 py-1 text-xs font-medium transition-colors',
              filters.type === t
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            )}
          >
            {t === 'none' ? 'Tutti' : t === 'month' ? 'Per mese' : 'Per settimana'}
          </button>
        ))}

        <div className="ml-2 flex flex-wrap items-center gap-1">
          {filters.type === 'month' && months.map(m => (
            <button
              key={m}
              type="button"
              onClick={() => toggleMonth(m)}
              className={cn(styles.pill, filters.months.includes(m) && styles.pillActive)}
            >
              M{m}
            </button>
          ))}
          {filters.type === 'week' && weeks.map(w => (
            <button
              key={w}
              type="button"
              onClick={() => toggleWeek(w)}
              className={cn(styles.pill, filters.weeks.includes(w) && styles.pillActive)}
            >
              W{w}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-4">
          <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
            <input
              type="checkbox"
              checked={filters.excludeWeekZero}
              onChange={e => setExcludeWeekZero(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
            />
            Escludi settimana 0
          </label>
          <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
            <input
              type="checkbox"
              checked={filters.excludeWithdrawn}
              onChange={e => setExcludeWithdrawn(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
            />
            Escludi withdrawn
          </label>
        </div>
      </div>
    </div>
  );
}
