'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { useAuthStore } from '@/lib/store/auth';
import { useNarStore } from '@/lib/store/nar';
import { useNarComputed } from '@/lib/store/nar-selectors';
import { narApi } from '@/lib/api/client';
import type { NarSnapshot } from '@/types/nar';
import {
  LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

const BUCKET_COLORS: Record<string, string> = {
  direct_all: '#6366f1',
  direct_no_es: '#10b981',
  direct_es_only: '#f59e0b',
  partner_all: '#8b5cf6',
};

export default function NarHistoryPage() {
  const token = useAuthStore(s => s.token);
  const upload = useNarStore(s => s.upload);
  const filters = useNarStore(s => s.filters);
  const { stats, bucketAnalysis } = useNarComputed();

  const [snapshots, setSnapshots] = useState<NarSnapshot[]>([]);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      const res = await narApi.listSnapshots(token);
      setSnapshots(res.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore caricamento snapshot');
    }
  }, [token]);

  useEffect(() => { refresh(); }, [refresh]);

  const saveSnapshot = async () => {
    if (!token || !label.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await narApi.saveSnapshot(token, {
        label: label.trim(),
        filterType: filters.type,
        monthFilter: filters.months,
        weekFilter: filters.weeks,
        excludeWeekZero: filters.excludeWeekZero,
        uploadId: upload?.id ?? null,
        stats: {
          totalRows: stats.totalRows,
          totalAccounts: stats.totalAccounts,
          directAccounts: stats.directAccounts,
          partnerAccounts: stats.partnerAccounts,
          esAccounts: stats.esAccounts,
          noEsAccounts: stats.noEsAccounts,
        },
        buckets: bucketAnalysis.map(b => ({
          key: b.key,
          name: b.name,
          accounts: b.pivot.accounts,
          rows: b.pivot.rows,
          sumConv: b.pivot.sumConv,
          sumTier: b.pivot.sumTier,
          ratio: parseFloat(b.pivot.ratio),
        })),
      });
      setLabel('');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore salvataggio snapshot');
    } finally {
      setBusy(false);
    }
  };

  const removeSnapshot = async (id: string) => {
    if (!token) return;
    if (!window.confirm('Eliminare questo snapshot?')) return;
    await narApi.deleteSnapshot(token, id);
    await refresh();
  };

  const chartData = snapshots.map(s => {
    const point: Record<string, number | string> = {
      label: s.label,
      date: new Date(s.createdAt).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' }),
    };
    for (const b of s.buckets) point[b.key] = b.ratio;
    return point;
  });

  return (
    <div className="space-y-6">
      <Card padding="md">
        <CardHeader><CardTitle>Salva snapshot del periodo corrente</CardTitle></CardHeader>
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder="es. NAR Settimana 42 - sales"
            className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
          />
          <button
            type="button"
            onClick={saveSnapshot}
            disabled={busy || !label.trim()}
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {busy ? 'Salvataggio…' : 'Salva snapshot'}
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-amber-700">{error}</p>}
      </Card>

      {chartData.length > 0 && (
        <Card padding="md">
          <CardHeader><CardTitle>Trend storico per bucket</CardTitle></CardHeader>
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} unit="%" />
              <Tooltip />
              <Legend />
              {Object.keys(BUCKET_COLORS).map(key => (
                <Line key={key} type="monotone" dataKey={key} stroke={BUCKET_COLORS[key]} strokeWidth={2} dot />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </Card>
      )}

      <Card padding="md">
        <CardHeader>
          <CardTitle>Snapshot salvati ({snapshots.length})</CardTitle>
        </CardHeader>
        <div className="space-y-2">
          {snapshots.length === 0 ? (
            <p className="text-sm text-slate-500">Nessuno snapshot salvato ancora.</p>
          ) : snapshots.slice().reverse().map(s => (
            <div key={s.id} className="flex items-start justify-between gap-4 rounded-lg border border-slate-200 bg-white p-3">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-900">{s.label}</span>
                  <Badge variant="outline" size="sm">{s.filterType}</Badge>
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {new Date(s.createdAt).toLocaleString('it-IT')}{s.createdByEmail && <> · {s.createdByEmail}</>}
                </div>
                <div className="mt-2 flex flex-wrap gap-3 text-xs">
                  {s.buckets.map(b => (
                    <span key={b.key} className="rounded-md bg-slate-50 px-2 py-1">
                      {b.name}: <strong>{b.ratio.toFixed(2)}%</strong> ({b.accounts} acc.)
                    </span>
                  ))}
                </div>
              </div>
              <button
                type="button"
                onClick={() => removeSnapshot(s.id)}
                className="text-xs text-red-600 hover:underline"
              >
                Elimina
              </button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
