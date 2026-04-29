'use client';

import { useMemo } from 'react';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { useNarStore } from '@/lib/store/nar';
import { useNarComputed } from '@/lib/store/nar-selectors';
import { BUCKETS } from '@/lib/services/nar-buckets';
import type { NarBucketKey } from '@/types/nar';
import {
  LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

const BUCKET_KEYS: NarBucketKey[] = ['direct_all', 'direct_no_es', 'direct_es_only', 'partner_all'];

export default function NarTrendPage() {
  const selectedBucket = useNarStore(s => s.selectedBucket);
  const setSelectedBucket = useNarStore(s => s.setSelectedBucket);
  const { weeklyTrend } = useNarComputed();

  const chartData = useMemo(
    () => weeklyTrend.map(p => ({ week: `W${p.week}`, NAR: Number(p.ratio), accounts: p.accounts })),
    [weeklyTrend]
  );

  return (
    <div className="space-y-6">
      <Card padding="md">
        <CardHeader>
          <CardTitle>NAR settimanale per bucket</CardTitle>
        </CardHeader>
        <div className="mb-4 flex flex-wrap gap-2">
          {BUCKET_KEYS.map(key => (
            <button
              key={key}
              type="button"
              onClick={() => setSelectedBucket(key)}
              className={
                selectedBucket === key
                  ? 'rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white'
                  : 'rounded-md bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-200'
              }
            >
              {BUCKETS[key].name}
            </button>
          ))}
        </div>
        <ResponsiveContainer width="100%" height={360}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="week" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} domain={[0, 'auto']} unit="%" />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="NAR" stroke="#10b981" strokeWidth={2} dot />
          </LineChart>
        </ResponsiveContainer>
      </Card>

      <Card padding="md">
        <CardHeader>
          <CardTitle>Tabella settimanale</CardTitle>
        </CardHeader>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2 text-left">Settimana</th>
                <th className="px-4 py-2 text-right">Account</th>
                <th className="px-4 py-2 text-right">Σ Conv</th>
                <th className="px-4 py-2 text-right">Σ Tier</th>
                <th className="px-4 py-2 text-right">NAR</th>
              </tr>
            </thead>
            <tbody>
              {weeklyTrend.map(p => (
                <tr key={p.week} className="border-t border-slate-100">
                  <td className="px-4 py-2">W{p.week}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{p.accounts}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{Math.round(p.sumConv).toLocaleString('it-IT')}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{Math.round(p.sumTier).toLocaleString('it-IT')}</td>
                  <td className="px-4 py-2 text-right tabular-nums font-semibold text-emerald-700">{p.ratio}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
