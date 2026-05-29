'use client';

import { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { useAuthStore } from '@/lib/store/auth';
import { useNarStore } from '@/lib/store/nar';
import { narApi } from '@/lib/api/client';
import { NarHealthScoreCard } from '@/components/nar/NarHealthScoreCard';
import { NarPathCard } from '@/components/nar/NarPathCard';
import { NarSignalList } from '@/components/nar/NarSignalList';
import type { NarInsights, NarPathKey } from '@/types/nar';

const PATH_ORDER: NarPathKey[] = ['neverStarted', 'fastDrop', 'slowDecline', 'intermittent', 'steady', 'growing'];

export default function NarInsightsPage() {
  const token = useAuthStore(s => s.token);
  const upload = useNarStore(s => s.upload);
  const filters = useNarStore(s => s.filters);
  const selectedBucket = useNarStore(s => s.selectedBucket);

  const [insights, setInsights] = useState<NarInsights | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<NarPathKey | null>(null);

  useEffect(() => {
    if (!token || !upload) return;
    setLoading(true);
    setError(null);
    narApi.generateInsights(token, { uploadId: upload.id, filters, bucketKey: selectedBucket })
      .then(res => setInsights(res.data ?? null))
      .catch(err => setError(err instanceof Error ? err.message : 'Errore generazione insights'))
      .finally(() => setLoading(false));
  }, [token, upload, filters, selectedBucket]);

  if (loading) {
    return <div className="rounded-xl bg-white p-8 text-center text-slate-500">Generazione insights in corso…</div>;
  }
  if (error) {
    return <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">{error}</div>;
  }
  if (!insights) {
    return <div className="rounded-xl bg-white p-8 text-center text-slate-500">Nessun dato disponibile.</div>;
  }

  return (
    <div className="space-y-6">
      <NarHealthScoreCard insights={insights} />

      {insights.criticalFindings.length > 0 && (
        <Card padding="md">
          <CardHeader>
            <CardTitle>Segnali critici</CardTitle>
            <span className="text-xs text-slate-500">Generato il {insights.reportDate}</span>
          </CardHeader>
          <div className="space-y-3">
            {insights.criticalFindings.map((f, i) => (
              <div
                key={i}
                className={
                  f.severity === 'critical' ? 'rounded-lg border-l-4 border-red-500 bg-red-50 p-3'
                  : f.severity === 'warning' ? 'rounded-lg border-l-4 border-amber-500 bg-amber-50 p-3'
                  : 'rounded-lg border-l-4 border-emerald-500 bg-emerald-50 p-3'
                }
              >
                <div className="flex items-center gap-2">
                  <Badge variant={f.severity === 'critical' ? 'danger' : f.severity === 'warning' ? 'warning' : 'success'} size="sm">
                    {f.severity}
                  </Badge>
                  <h4 className="font-semibold text-slate-900">{f.title}</h4>
                </div>
                <p className="mt-1 text-sm text-slate-700">{f.detail}</p>
                <p className="mt-1 text-xs text-slate-600 italic">{f.impact}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card padding="md">
        <CardHeader>
          <CardTitle>Behavior path analysis</CardTitle>
          <span className="text-xs text-slate-500">{insights.totalPathAccounts.toLocaleString('it-IT')} account analizzati</span>
        </CardHeader>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          {PATH_ORDER.map(p => {
            const count = insights.paths[p].length;
            const pct = insights.totalPathAccounts > 0 ? (count / insights.totalPathAccounts) * 100 : 0;
            return (
              <NarPathCard
                key={p}
                pathKey={p}
                count={count}
                pct={pct}
                selected={selectedPath === p}
                onClick={count > 0 ? () => setSelectedPath(selectedPath === p ? null : p) : undefined}
              />
            );
          })}
        </div>

        {selectedPath && insights.paths[selectedPath].length > 0 && (
          <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left">Account</th>
                  <th className="px-3 py-2 text-left">Plan</th>
                  <th className="px-3 py-2 text-left">Operatore</th>
                  <th className="px-3 py-2 text-right">Tier</th>
                  <th className="px-3 py-2 text-right">Conv</th>
                  <th className="px-3 py-2 text-right">Sett. attive</th>
                </tr>
              </thead>
              <tbody>
                {insights.paths[selectedPath].slice(0, 100).map(a => (
                  <tr key={a.accountId} className="border-t border-slate-100">
                    <td className="px-3 py-2">{a.accountName} <span className="text-xs text-slate-400">({a.accountId})</span></td>
                    <td className="px-3 py-2"><Badge variant="outline" size="sm">{a.plan}</Badge></td>
                    <td className="px-3 py-2 text-slate-700">{a.operator}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{a.tier.toLocaleString('it-IT')}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{Math.round(a.totalConsumption).toLocaleString('it-IT')}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{a.weeksActive}/{a.totalWeeks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card padding="md">
          <CardHeader><CardTitle>Segment comparison</CardTitle></CardHeader>
          <NarSignalList signals={insights.segmentComparison} />
        </Card>
        <Card padding="md">
          <CardHeader><CardTitle>Trend signals</CardTitle></CardHeader>
          <NarSignalList signals={[...insights.trendSignals, ...insights.weeklyDecayInsights]} />
        </Card>
        <Card padding="md">
          <CardHeader><CardTitle>Operatori</CardTitle></CardHeader>
          <NarSignalList signals={insights.operatorInsights} />
        </Card>
        <Card padding="md">
          <CardHeader><CardTitle>Storico</CardTitle></CardHeader>
          <NarSignalList signals={insights.historyInsights} />
        </Card>
      </div>

      {insights.planRisk.length > 0 && (
        <Card padding="md">
          <CardHeader><CardTitle>Plan risk ranking</CardTitle></CardHeader>
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left">Plan</th>
                  <th className="px-3 py-2 text-right">Account</th>
                  <th className="px-3 py-2 text-right">Churn</th>
                  <th className="px-3 py-2 text-right">Early churn</th>
                  <th className="px-3 py-2 text-right">Mai usato</th>
                  <th className="px-3 py-2 text-right">Risk score</th>
                </tr>
              </thead>
              <tbody>
                {insights.planRisk.map(p => (
                  <tr key={p.plan} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-medium text-slate-900">{p.plan}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{p.total}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{p.churnPct.toFixed(1)}%</td>
                    <td className="px-3 py-2 text-right tabular-nums">{p.earlyChurnPct.toFixed(1)}%</td>
                    <td className="px-3 py-2 text-right tabular-nums">{p.neverUsedPct.toFixed(1)}%</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold">
                      <span className={
                        p.riskScore >= 50 ? 'text-red-700'
                        : p.riskScore >= 30 ? 'text-amber-700'
                        : 'text-emerald-700'
                      }>
                        {p.riskScore}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {insights.actions.length > 0 && (
        <Card padding="md">
          <CardHeader><CardTitle>Azioni consigliate</CardTitle></CardHeader>
          <div className="space-y-3">
            {insights.actions.map((a, i) => (
              <div key={i} className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="flex items-center gap-2">
                  <Badge variant={a.priority === 1 ? 'danger' : a.priority === 2 ? 'warning' : 'default'} size="sm">
                    P{a.priority}
                  </Badge>
                  <span className="text-sm text-slate-900">{a.action}</span>
                </div>
                <p className="mt-1 text-xs text-slate-600 italic">{a.expectedImpact}</p>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
