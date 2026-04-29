'use client';

import type { NarBucketResult, NarBucketKey } from '@/types/nar';
import { cn } from '@/lib/utils/cn';

interface Props {
  buckets: NarBucketResult[];
  selected?: NarBucketKey;
  onSelect?: (key: NarBucketKey) => void;
}

export function NarBucketTable({ buckets, selected, onSelect }: Props) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-2 text-left">Bucket</th>
            <th className="px-4 py-2 text-right">Account</th>
            <th className="px-4 py-2 text-right">Righe</th>
            <th className="px-4 py-2 text-right">Σ Conv.</th>
            <th className="px-4 py-2 text-right">Σ Tier</th>
            <th className="px-4 py-2 text-right">NAR pivot</th>
            <th className="px-4 py-2 text-right">NAR dedup</th>
          </tr>
        </thead>
        <tbody>
          {buckets.map(b => (
            <tr
              key={b.key}
              onClick={onSelect ? () => onSelect(b.key) : undefined}
              className={cn(
                'border-t border-slate-100',
                onSelect && 'cursor-pointer hover:bg-slate-50',
                selected === b.key && 'bg-emerald-50'
              )}
            >
              <td className="px-4 py-2">
                <div className="font-medium text-slate-900">{b.name}</div>
                <div className="text-xs text-slate-500">{b.desc}</div>
              </td>
              <td className="px-4 py-2 text-right tabular-nums">{b.pivot.accounts.toLocaleString('it-IT')}</td>
              <td className="px-4 py-2 text-right tabular-nums text-slate-500">{b.pivot.rows.toLocaleString('it-IT')}</td>
              <td className="px-4 py-2 text-right tabular-nums">{Math.round(b.pivot.sumConv).toLocaleString('it-IT')}</td>
              <td className="px-4 py-2 text-right tabular-nums">{Math.round(b.pivot.sumTier).toLocaleString('it-IT')}</td>
              <td className="px-4 py-2 text-right font-semibold tabular-nums text-emerald-700">{b.pivot.ratio}%</td>
              <td className="px-4 py-2 text-right tabular-nums text-slate-500">{b.dedup.ratio}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
