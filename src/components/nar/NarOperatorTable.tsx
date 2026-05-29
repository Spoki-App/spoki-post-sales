'use client';

import type { NarOperatorBreakdown } from '@/lib/services/nar-operators';
import { cn } from '@/lib/utils/cn';

interface Props {
  rows: NarOperatorBreakdown[];
}

function fmtNar(v: number): string {
  return `${v.toFixed(1)}%`;
}

function narColor(v: number, isNa: boolean | undefined): string {
  if (isNa) return 'text-slate-400';
  if (v >= 25) return 'text-emerald-700';
  if (v >= 15) return 'text-amber-700';
  return 'text-red-700';
}

export function NarOperatorTable({ rows }: Props) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-2 text-left">Operatore</th>
            <th className="px-4 py-2 text-right">Account</th>
            <th className="px-4 py-2 text-right">NAR Direct (no ES)</th>
            <th className="px-4 py-2 text-right">NAR Direct ES</th>
            <th className="px-4 py-2 text-right">NAR Partner</th>
            <th className="px-4 py-2 text-right">NAR Totale</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.operator} className={cn('border-t border-slate-100', r.isNA && 'bg-amber-50/40')}>
              <td className="px-4 py-2">
                <span className={cn('font-medium', r.isNA ? 'text-amber-700' : 'text-slate-900')}>{r.operator}</span>
              </td>
              <td className="px-4 py-2 text-right tabular-nums">{r.totalAccounts}</td>
              <td className={cn('px-4 py-2 text-right tabular-nums font-medium', narColor(r.directNar, r.isNA))}>{fmtNar(r.directNar)}</td>
              <td className={cn('px-4 py-2 text-right tabular-nums', narColor(r.directEsNar, r.isNA))}>{fmtNar(r.directEsNar)}</td>
              <td className={cn('px-4 py-2 text-right tabular-nums', narColor(r.partnerNar, r.isNA))}>{fmtNar(r.partnerNar)}</td>
              <td className={cn('px-4 py-2 text-right tabular-nums font-semibold', narColor(r.totalNar, r.isNA))}>{fmtNar(r.totalNar)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
